# Development — everyday commands

A cheat sheet for running viva day to day: starting/stopping the backend stack,
the Metro bundler, simulators, and real devices. For first-time setup and
per-platform details see [README.md](README.md), [iOS.md](iOS.md), and
[ANDROID.md](ANDROID.md).

## TL;DR — the daily loop

Two terminals:

```bash
# Terminal 1 — backend API (:4000) + voice agent worker
./dev.sh                 # or ./restart.sh to force a clean (re)start

# Terminal 2 — the mobile app (Metro + your simulator/device)
cd mobile && npx expo start --dev-client
#   press  i  → open on the iOS Simulator
#   press  a  → open on the Android emulator
#   press  r  → reload   ·   j → open debugger   ·   ? → all shortcuts
```

`--dev-client` (not plain Expo Go) is required for the live interview, because
the app ships native WebRTC. Plain Expo Go only runs the UI demo
(`EXPO_PUBLIC_LIVE_ENABLED=false`).

## The backend stack (`./dev.sh` + `./restart.sh`)

The "backend stack" is the Fastify API (`:4000`) **and** the LiveKit voice-agent
worker — exactly what `./dev.sh` launches together.

| Command | What it does |
|---------|--------------|
| `./dev.sh` | Start API + agent in the foreground. Reuses an API already on `:4000`. **Ctrl-C** stops everything it started. |
| `./restart.sh` | **Stop then start** the stack — the easy "turn it off and on again". Clears orphaned watchers / a wedged `:4000`, then runs `./dev.sh`. |
| `./restart.sh stop` | Stop the stack and exit (free `:4000`, kill the agent). |
| `./restart.sh start` | Start the stack (same as `./dev.sh`). |
| `./restart.sh status` | Read-only: is the API up? agent? Metro? booted simulators/devices? |
| `./restart.sh --metro` | Also free the Metro bundler (`:8081`) — add to `stop`/`restart`. |
| `./restart.sh --dry-run` | Print what *would* be stopped; kill nothing. Pair with any command. |

`restart.sh` scopes every kill to this repo's path, so your other projects'
`node`/`tsx` processes are never touched.

Run the API or agent on their own (separate watch logs):

```bash
cd server && npm run dev     # Fastify API on :4000 (tsx watch)
cd agent  && npm run dev     # voice-agent worker (tsx watch)
cd agent  && npm run spike   # connectivity check: creds + VAD + STT/TTS + token
```

Check / free the ports manually if needed:

```bash
curl -s http://localhost:4000/v1/healthz            # {"ok":true,...} when up
lsof -nP -iTCP:4000 -sTCP:LISTEN                     # who holds the API port
lsof -nP -iTCP:8081 -sTCP:LISTEN                     # who holds Metro
kill $(lsof -tiTCP:4000 -sTCP:LISTEN)                # free :4000 (or use restart.sh stop)
```

## Mobile app & Metro bundler

```bash
cd mobile
npm install                       # after pulling dependency changes
npx expo start --dev-client       # start Metro for an installed dev build
npx expo start --dev-client -c    # ...and clear the Metro/transform cache
npx expo run:ios                  # build + install + launch (iOS Simulator)
npx expo run:android              # build + install + launch (Android emulator)
npx tsc --noEmit                  # typecheck the app
```

In the Metro terminal: `i` iOS · `a` Android · `r` reload · `j` debugger ·
`m` dev menu · `?` list all.

> Env vars (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_LIVE_ENABLED`) are inlined at
> **build** time — change `mobile/.env`, then **rebuild** (`run:ios`/`run:android`),
> a Metro reload alone won't pick them up.

## iOS Simulator

```bash
xcrun simctl list devices                      # all simulators + UDIDs
xcrun simctl list devices booted               # only the booted ones
open -a Simulator                              # open the Simulator app
xcrun simctl boot "iPhone 17 Pro"              # boot a specific device
xcrun simctl shutdown all                      # shut down all simulators
xcrun simctl erase all                         # factory-reset all (wipes data/permissions)
xcrun simctl uninstall booted com.viva.interview   # remove just the app
```

- `npx expo run:ios` targets the default/booted simulator; `npx expo run:ios --device` lets you pick.
- Resetting a stuck mic/camera permission: `xcrun simctl privacy booted reset all com.viva.interview`.

## iOS real device

```bash
npx expo run:ios --device          # build + install on a chosen iPhone (USB)
xcrun xctrace list devices         # list attached physical devices
```

First time: open `mobile/ios/viva.xcworkspace` in Xcode, set a Signing Team for
the **viva** target, re-run, then on the iPhone trust the developer profile
(Settings → General → VPN & Device Management). Set `EXPO_PUBLIC_API_URL` to your
Mac's LAN IP (`ipconfig getifaddr en0`). Full details in [iOS.md](iOS.md).

## Android emulator

```bash
emulator -list-avds                # list your AVDs
emulator -avd <name>               # boot an emulator
adb devices                        # confirm it's connected
npx expo run:android               # build + install + launch
adb reverse tcp:4000 tcp:4000      # let the emulator reach the host API via localhost
adb logcat                         # device logs (Ctrl-C to stop)
adb uninstall com.viva.interview   # remove the app
```

Networking: the emulator can't use `localhost` for the backend — either set
`EXPO_PUBLIC_API_URL=http://10.0.2.2:4000`, or run `adb reverse` (above) and keep
`http://localhost:4000`. A real device uses the Mac's LAN IP. See
[ANDROID.md](ANDROID.md).

## Android real device

```bash
adb devices                        # confirm USB debugging is on and authorized
npx expo run:android --device      # build + install on the connected phone
adb -s <serial> logcat             # logs from a specific device
```

## Tests & typecheck

```bash
cd server && npm test              # backend (Vitest): agents, API, auth, stores, integrity
cd agent  && npm test              # agent (Vitest): BackendClient paths/retry
cd mobile && npx tsc --noEmit      # mobile typecheck (no test script defined)
cd server && npm run eval          # live scoring calibration (needs ANTHROPIC_API_KEY)
```

Server/agent tests use mock LLM clients and an in-memory store — no real keys or
DB required.

## When things get stuck

| Symptom | Fix |
|---------|-----|
| API won't start / `:4000` wedged / orphaned watcher | `./restart.sh` (or `./restart.sh stop` then `./dev.sh`) |
| Stale Metro cache, weird red screen | `cd mobile && npx expo start --dev-client -c` |
| Metro port `:8081` stuck | `./restart.sh stop --metro`, then restart Metro |
| Native build is wrong after a config/plugin change | regenerate: `cd mobile && npx expo prebuild --clean -p ios` (or `-p android`) |
| iOS Pods out of sync | `cd mobile/ios && pod install` (or `pod repo update && pod install`) |
| App can't reach the backend | check `EXPO_PUBLIC_API_URL` (LAN IP for real devices, `10.0.2.2`/`adb reverse` for the Android emulator) and that the API is up (`./restart.sh status`) |
| Need a totally clean app state | uninstall the app (`xcrun simctl uninstall booted com.viva.interview` / `adb uninstall com.viva.interview`) and reinstall |
