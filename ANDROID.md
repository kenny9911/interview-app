# Running viva on Android

This guide walks you through running the **viva** mobile app (in `mobile/`) on Android — both on an emulator and on a real device.

> **The backend must be running first.** The app talks to the viva backend API (and, for live voice, the LiveKit voice agent). Start those before launching the app — see [README.md](README.md) for the full backend setup. A quick path is covered in [1. Start the backend](#1-start-the-backend) below.

## Prerequisites

- **Android Studio** — install it and open it once so it can download the SDK.
- **Android SDK + platform-tools** — via Android Studio's SDK Manager, install an SDK Platform, the SDK Build-Tools, the **Platform-Tools** (this provides `adb`), and the Command-line Tools. Make sure `adb` is on your `PATH` and `ANDROID_HOME` points at your SDK (typically `$HOME/Library/Android/sdk` on macOS).
- **A JDK** (e.g. JDK 17) — required by the Android Gradle build. Set `JAVA_HOME` to it.
- **An emulator or a physical device:**
  - **Emulator:** create an AVD in Android Studio's Device Manager, or
  - **Physical device:** enable **Developer Options** (tap *Build number* 7 times) and turn on **USB debugging**.
- **Node 20+** (the development environment uses Node v24.7.0).

Example shell setup (add to your `~/.zshrc`):

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

## Important: dev build vs Expo Go

The live voice interview uses **native WebRTC** (`@livekit/react-native-webrtc` plus the LiveKit / WebRTC config plugins). **Plain Expo Go cannot load these native modules**, so live voice requires a **custom dev build** — built with `npx expo run:android` (covered below) or with EAS.

**Expo Go can only run the UI demo** (no backend, no LiveKit). To use it, set `EXPO_PUBLIC_LIVE_ENABLED=false` in `mobile/.env`; the live-interview screens then run in UI-only demo mode.

> There is **no `android/` folder in the repo yet** — it is a generated native project (it is git-ignored). It is created by `npx expo prebuild -p android`, or implicitly the first time you run `npx expo run:android`.

## 1. Start the backend

From the repo root, copy the env template and start the API + agent worker:

```bash
cp .env.example .env   # fill in LiveKit / LLM / STT / TTS keys for live voice
./dev.sh
```

`./dev.sh` launches the backend API on port **4000** and the LiveKit voice agent worker together. See [README.md](README.md) for full details on the backend, env vars, and what "live voice" requires.

## 2. Configure the mobile app

```bash
cd mobile
npm install
cp .env.example .env
```

`mobile/.env` has just two keys: `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_LIVE_ENABLED`. They are inlined at build time, so **rebuild the app after changing them**.

### CRITICAL: networking to the backend

The default `EXPO_PUBLIC_API_URL=http://localhost:4000` does **not** work on Android — on the emulator and on a device, `localhost` points at the device itself, not your Mac. Pick the option that matches your target:

- **Emulator — host loopback alias:** set
  ```
  EXPO_PUBLIC_API_URL=http://10.0.2.2:4000
  ```
  `10.0.2.2` is the Android emulator's alias for the host machine's loopback.
- **Emulator — `adb reverse`:** forward the port, then use `localhost`:
  ```bash
  adb reverse tcp:4000 tcp:4000
  ```
  ```
  EXPO_PUBLIC_API_URL=http://localhost:4000
  ```
- **Real device:** use your Mac's LAN IP (phone and Mac on the same Wi-Fi):
  ```bash
  ipconfig getifaddr en0      # e.g. 192.168.1.23
  ```
  ```
  EXPO_PUBLIC_API_URL=http://192.168.1.23:4000
  ```

The API already binds `0.0.0.0` (so it is reachable over the LAN). If you hit CORS issues (mainly on the web target), add your origin to `CORS_ORIGINS` in the root `.env`.

## 3a. Run on an emulator

1. Start the backend (see [step 1](#1-start-the-backend)) and configure `mobile/.env` (see [step 2](#2-configure-the-mobile-app)).
2. Start an AVD from Android Studio's Device Manager, or from the CLI:
   ```bash
   emulator -avd <name>
   ```
   Confirm it is connected:
   ```bash
   adb devices
   ```
3. Build, install, and launch the dev build:
   ```bash
   npx expo run:android
   ```
   This generates the `android/` folder (if missing), builds the native app, installs it on the emulator, and launches it. The first Gradle build is slow; later runs are faster.

## 3b. Run on a real device

1. On the phone, enable **Developer Options** and turn on **USB debugging**, then plug it in over USB (accept the RSA prompt on the device).
2. Confirm it is connected:
   ```bash
   adb devices
   ```
3. Build, install, and launch on the device:
   ```bash
   npx expo run:android --device
   ```
   (If multiple devices are attached, you'll be prompted to pick one.)
4. **Grant the microphone and camera permission when prompted** — the mic is required for the live interview.

## Building an APK/AAB (EAS, optional)

EAS cloud builds produce installable artifacts (requires an Expo account: `eas login`):

```bash
# internal APK for testing:
eas build -p android --profile preview

# production AAB for the Play Store:
eas build -p android --profile production
```

## Permissions

The app declares these Android permissions (in `app.json`, written into the generated `AndroidManifest.xml` at prebuild time):

- `RECORD_AUDIO`
- `CAMERA`
- `MODIFY_AUDIO_SETTINGS`

The LiveKit Expo plugin sets `audioType: "communication"`, which routes audio through the communication/VoIP audio mode during the live interview.

## Troubleshooting

- **SDK licenses not accepted** — Gradle builds fail until you accept them:
  ```bash
  sdkmanager --licenses
  ```
- **`ANDROID_HOME` or JDK not set** — `adb`/Gradle can't be found, or the build can't locate a JDK. Set `ANDROID_HOME` and `JAVA_HOME` (see [Prerequisites](#prerequisites)).
- **No `android/` folder** — generate the native project:
  ```bash
  npx expo prebuild -p android
  ```
  (or just run `npx expo run:android`, which does this implicitly).
- **Can't reach the backend** — `localhost` never reaches your Mac from the emulator/device. Use `http://10.0.2.2:4000`, or `adb reverse tcp:4000 tcp:4000` with `localhost`, or the Mac's LAN IP on a real device (see [step 2](#2-configure-the-mobile-app)). Remember to rebuild after editing `EXPO_PUBLIC_API_URL`.
- **No audio in the interview** — make sure the microphone permission was granted, and that you are **not** in demo mode (live voice needs `EXPO_PUBLIC_LIVE_ENABLED=true` and a dev build, not Expo Go).
- **Clean rebuild** — if a plugin or permission change isn't taking effect, regenerate the native project:
  ```bash
  rm -rf android && npx expo prebuild -p android
  ```
- **Gradle issues** — a clean rebuild (above) resolves most stale-build problems; confirm you are on a supported JDK (e.g. 17) and that the Android SDK components are installed.
