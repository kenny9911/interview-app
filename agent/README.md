# viva agent worker

The LiveKit voice agent that joins an interview room and runs the realtime voice
loop. It owns **audio I/O only** (Silero VAD + Deepgram STT + Cartesia TTS, with
the framework's built-in turn detection and barge-in); every interviewer line
comes from the backend brain via `/begin` and `/next-turn`, so the four-agent
orchestration stays in one tested place.

## Requirements
- The backend (`../server`) running and reachable at `API_BASE_URL`.
- Env (repo-root `.env`): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `DEEPGRAM_API_KEY`, `CARTESIA_API_KEY`, and `API_BASE_URL`.

## Run
```bash
cd agent
npm install
# 1) connectivity spike — verifies creds + VAD + STT/TTS + token (no participant needed)
LIVEKIT_URL=... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... DEEPGRAM_API_KEY=... CARTESIA_API_KEY=... npm run spike
# 2) run the worker (it waits for interview rooms and joins them)
npm run dev
```
Then start an interview from the app — the backend mints a token for room
`viva-interview-<sessionId>`, the worker is dispatched into it, greets the
candidate, and the conversation begins.

## How it works
1. Worker joins room `viva-interview-<sessionId>`; reads `style` from room metadata.
2. `AgentSession` (VAD + STT + TTS) handles capture, endpointing, and barge-in.
3. On start → `backend.begin(sessionId)` → speaks the greeting + Q1.
4. On each final user transcript → `backend.nextTurn(sessionId, text)` → speaks the
   reply; when `ended`, calls `backend.complete(sessionId)` to trigger analysis.
5. Publishes `{type:"agent_state",state}` + `{type:"caption",text}` over the data
   channel so the app's orb + captions stay in sync (docs/15-decisions.md D7/D10).

## Notes
- Per-style endpointing (friendly/balanced/tough) maps to `turnHandling.endpointing`
  (mirrors `server/src/voice/endpointer.ts`).
- Barge-in is handled by the framework (`allowInterruptions`), surfaced to the app
  via the agent-state transitions.
- `npm test` covers the backend client; the live audio path is validated by the
  spike + a real device/room (needs the creds above).
