// Agent worker env. LiveKit + STT/TTS creds + the backend URL it drives turns
// against. Reads from process.env (see repo-root .env.example).
import { existsSync } from 'node:fs';

for (const p of ['.env', '../.env']) {
  if (existsSync(p)) { try { (process as { loadEnvFile?: (f: string) => void }).loadEnvFile?.(p); } catch { /* ignore */ } }
}

export const env = {
  LIVEKIT_URL: process.env.LIVEKIT_URL ?? '',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? '',
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY ?? '',
  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY ?? '',
  API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:4000',
  AGENT_SERVICE_TOKEN: process.env.AGENT_SERVICE_TOKEN ?? 'dev-agent-token',
  // tuning
  STT_MODEL: process.env.DEEPGRAM_MODEL ?? 'nova-3',
  // sonic-3 is the current Cartesia default (matches the installed plugin + API
  // version 2025-04-16); the older 'sonic-2' can be rejected and fail silently.
  TTS_MODEL: process.env.CARTESIA_MODEL ?? 'sonic-3',
};

export function assertLiveCreds(): void {
  const missing = (['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'DEEPGRAM_API_KEY', 'CARTESIA_API_KEY'] as const)
    .filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required env for the agent worker: ${missing.join(', ')}`);
}
