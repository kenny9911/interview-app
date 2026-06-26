# Running viva on iOS

This guide walks you through running the viva mobile app on the iOS Simulator and on a real iPhone. It covers the mobile app only — the backend (API + voice agent) must be running first, so start there before you do anything below: a quick path is in [1. Start the backend](#1-start-the-backend) below, and the full backend setup is in [README.md](README.md) (with [docs/63-deployment-runbook.md](docs/63-deployment-runbook.md) for deploy/ops detail).

## Prerequisites

- **macOS** with **Xcode** installed (from the App Store). Open it once to accept the license and let it install its components.
- **Xcode Command Line Tools**:

  ```bash
  xcode-select --install
  ```

- **CocoaPods** (manages the iOS native dependencies):

  ```bash
  sudo gem install cocoapods
  # or: brew install cocoapods
  ```

- **Node 20+** (a recent LTS or newer).
- **watchman** (recommended for Metro file watching):

  ```bash
  brew install watchman
  ```

For a **real iPhone**, you also need:

- An **Apple ID** added to Xcode (Settings → Accounts). Free personal provisioning is enough to run the app on your own device — no paid Apple Developer Program is required for local dev builds.
- A **USB cable** (or the iPhone and Mac on the **same Wi-Fi** for wireless builds).

## Important: dev build vs Expo Go

The live voice interview uses **native WebRTC** (LiveKit), which **plain Expo Go cannot load**. To run live voice you must use a **custom dev build**:

```bash
npx expo run:ios
# or build it on EAS (see "EAS builds" below)
```

**Expo Go can only run the UI in demo mode.** In that mode the live-interview screens render UI-only, with no backend or LiveKit. To use it, set:

```bash
EXPO_PUBLIC_LIVE_ENABLED=false
```

The native `ios/` folder is a **git-ignored prebuild output** — it is generated from `app.json` and is not committed. If it is missing or you need to regenerate it:

```bash
npx expo prebuild -p ios
# add --clean to wipe and regenerate from scratch
```

## 1. Start the backend

From the repo root, set up the shared environment and launch the API + voice agent:

```bash
cp .env.example .env      # then fill in your keys
./dev.sh                  # starts the API on :4000 and the voice agent worker
```

`./dev.sh` launches the Fastify API on port **4000** (health: `GET /v1/healthz`) and the LiveKit voice-agent worker together. See [README.md](README.md) for full details on the backend, env vars, and what live voice requires.

## 2. Configure the mobile app

```bash
cd mobile
npm install
cp .env.example .env
```

Edit `mobile/.env`:

- **`EXPO_PUBLIC_API_URL`** — the backend base URL.
  - **iOS Simulator:** `http://localhost:4000`
  - **Real iPhone:** your Mac's LAN IP (the phone can't reach `localhost`). Find it with:

    ```bash
    ipconfig getifaddr en0      # e.g. 192.168.1.23
    ```

    then set `EXPO_PUBLIC_API_URL=http://192.168.1.23:4000`.
- **`EXPO_PUBLIC_LIVE_ENABLED`** — set to `true` for the live voice interview (the default).

> `EXPO_PUBLIC_*` values are inlined at build/bundle time, not read at runtime. After changing `.env`, restart Metro and rebuild so the new values take effect.

## 3a. Run on the iOS Simulator

```bash
cd mobile
npx expo run:ios
```

This builds the app, installs it on a Simulator, and launches it. The **first build runs `pod install` automatically**.

Once a dev build is installed, you can also start Metro with `npx expo start --dev-client` and press **`i`** to open it on the Simulator.

## 3b. Run on a real iPhone

```bash
cd mobile
npx expo run:ios --device
```

`--device` prompts you to pick the connected iPhone.

The **first time** you build to a device:

1. Open the workspace in Xcode and set a signing team:

   ```bash
   open ios/viva.xcworkspace
   ```

   In Xcode, select the **viva** target → **Signing & Capabilities** → set your **Team** (add your Apple ID under Xcode → Settings → Accounts for free provisioning). The bundle id is `com.viva.interview`.
2. Re-run `npx expo run:ios --device`.
3. On the iPhone, **trust the developer profile**: Settings → General → VPN & Device Management → tap your Apple ID → Trust. Then reopen the app.
4. **Grant microphone (and camera) permission** when the app prompts on first live use.

Remember: a real iPhone must use the **Mac's LAN IP** for `EXPO_PUBLIC_API_URL` (see step 2), not `localhost`.

## CocoaPods

Install pods manually when you need to:

```bash
cd ios && pod install
```

You typically only run this by hand after changing native dependencies or pulling a new `Podfile`/lockfile. Pods are installed **automatically** during `npx expo run:ios` (on the first build) and during `npx expo prebuild`.

## EAS builds (optional)

Cloud builds via EAS (requires an Expo account):

```bash
# Simulator build
eas build --profile development-simulator --platform ios

# Real device (dev client, internal distribution)
eas build --profile development --platform ios

# Production build
eas build --profile production --platform ios
```

## Permissions

The app declares these in `app.json` (`ios.infoPlist`):

- **Microphone** — `NSMicrophoneUsageDescription` (required for the AI interviewer to hear you).
- **Camera** — `NSCameraUsageDescription` (optional; you can keep it off).
- **Background audio / VoIP** — `UIBackgroundModes: ["audio", "voip"]` (keeps the voice session alive in the background).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **`pod install` fails** | Update the spec repos and reinstall: `pod repo update` then `cd ios && pod install`. If still broken, regenerate the native project: `npx expo prebuild -p ios --clean`. |
| **Signing errors** (real device) | Open `ios/viva.xcworkspace`, select the **viva** target → Signing & Capabilities, enable **Automatically manage signing**, and pick your **Team** (add your Apple ID in Xcode → Settings → Accounts). Then re-run `npx expo run:ios --device`. |
| **"Untrusted Developer"** on launch | On the iPhone: Settings → General → VPN & Device Management → tap your Apple ID → **Trust**, then reopen the app. |
| **App can't reach the backend** | Use the Mac's **LAN IP** (`ipconfig getifaddr en0`), not `localhost`. The server already binds `0.0.0.0` (so it is reachable over the LAN). Ensure the iPhone and Mac are on the **same Wi-Fi**, and check that the macOS firewall allows incoming connections to node. (CORS does not apply to native iOS `fetch` — `CORS_ORIGINS` only matters for the web target.) |
| **No audio in the interview** | Grant **Microphone** permission (iOS Settings → viva → Microphone), and make sure you're running a **dev build** with `EXPO_PUBLIC_LIVE_ENABLED=true` — not Expo Go / demo mode. |
| **Metro or port conflicts** | Stop any stale Metro/dev-server process and free the port, then restart with `npx expo start --dev-client` (or re-run `npx expo run:ios`). |
| **Clean rebuild** | Remove the native project and regenerate it: `rm -rf ios && npx expo prebuild -p ios`. |
