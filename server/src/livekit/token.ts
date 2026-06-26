// LiveKit access-token minting + agent dispatch metadata.
// Tokens are short-TTL and scoped to a single room (docs/20-architecture.md,
// docs/15-decisions.md D14: client refreshes at TTL/2).
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../env.js';

/** Create the interview room with persona/style metadata so the agent worker can
 *  read it on join (D-persona). No-op with dev/test creds to avoid network calls. */
export async function ensureInterviewRoom(roomName: string, metadata: Record<string, unknown>): Promise<void> {
  if (!env.LIVEKIT_API_KEY || env.LIVEKIT_API_KEY === 'devkey') return;
  const host = env.LIVEKIT_URL.replace(/^ws/, 'http');
  const svc = new RoomServiceClient(host, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  try {
    await svc.createRoom({ name: roomName, metadata: JSON.stringify(metadata), emptyTimeout: 300, maxParticipants: 3 });
  } catch {
    // room may already exist or will be created on first join — non-fatal
  }
}

export interface RoomGrant {
  roomName: string;
  identity: string;
  name?: string;
  ttlSeconds?: number;
  canPublish?: boolean;
  canSubscribe?: boolean;
}

export async function mintAccessToken(grant: RoomGrant): Promise<{ token: string; url: string; expiresAt: number }> {
  const ttl = grant.ttlSeconds ?? 15 * 60; // 15 min; client re-mints at TTL/2
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: grant.identity,
    name: grant.name,
    ttl,
  });
  at.addGrant({
    room: grant.roomName,
    roomJoin: true,
    canPublish: grant.canPublish ?? true,
    canSubscribe: grant.canSubscribe ?? true,
    canPublishData: true,
  });
  const token = await at.toJwt();
  return { token, url: env.LIVEKIT_URL, expiresAt: Date.now() + ttl * 1000 };
}

export function roomNameForSession(sessionId: string): string {
  return `viva-interview-${sessionId}`;
}

export function agentIdentityForSession(sessionId: string): string {
  return `agent-${sessionId}`;
}
