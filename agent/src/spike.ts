// Connectivity spike (the M0 gate from docs/15-decisions.md D4). Verifies that
// credentials, the VAD model, the STT/TTS plugins, and LiveKit token minting all
// wire up — without needing a live participant. Run: `npm run spike`.
import { AccessToken } from 'livekit-server-sdk';
import * as silero from '@livekit/agents-plugin-silero';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import { env, assertLiveCreds } from './env.js';
import { vadTuning } from './voiceConfig.js';

async function main() {
  assertLiveCreds();
  console.log('✓ env creds present');

  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity: 'spike-agent', ttl: 60 });
  at.addGrant({ room: 'viva-spike', roomJoin: true });
  const token = await at.toJwt();
  console.log(`✓ minted LiveKit token (${token.length} chars) for ${env.LIVEKIT_URL}`);

  const t = vadTuning();
  const vad = await silero.VAD.load({
    minSpeechDuration: t.minSpeechDuration,
    minSilenceDuration: t.minSilenceDuration,
    prefixPaddingDuration: t.prefixPaddingDuration,
    activationThreshold: t.activationThreshold,
  });
  console.log('✓ Silero VAD loaded (tuned)', vad ? JSON.stringify(t) : '');

  // constructing the plugins validates the wiring (keys are read from env)
  new deepgram.STT({ model: env.STT_MODEL as NonNullable<ConstructorParameters<typeof deepgram.STT>[0]>['model'] });
  console.log('✓ Deepgram STT constructed');
  new cartesia.TTS({ model: env.TTS_MODEL });
  console.log('✓ Cartesia TTS constructed');

  console.log('\nSPIKE OK — creds + VAD + STT/TTS + token all wired. Now run `npm run dev` and start an interview from the app.');
}

main().catch((err) => {
  console.error('SPIKE FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
});
