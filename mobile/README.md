# viva — AI Video Interview App (React Native / Expo)

Cross-platform **iOS + Android** port of the *viva* "Atelier" design. One Expo
codebase, no custom native modules — runs in **Expo Go** on a real phone or in a
simulator.

- **Stack:** Expo SDK 56 · React 19 · React Native 0.85 · TypeScript
- **Navigation:** React Navigation (native-stack)
- **Graphics:** react-native-svg (icons, score ring, orb gradients), expo-linear-gradient
- **Animation:** React Native's built-in `Animated` (orb breathe, ring pulse, voice bars) — no Reanimated, so nothing to configure
- **Type:** Bricolage Grotesque + Hanken Grotesk via `@expo-google-fonts`

## Run it

```bash
cd mobile
npm install
npx expo start
```

Then:
- **iPhone / Android phone:** install **Expo Go**, scan the QR code in the terminal.
- **iOS simulator:** press `i` (needs Xcode, macOS).
- **Android emulator:** press `a` (needs Android Studio).
- **Web preview:** press `w`.

## Verified

- `npx tsc --noEmit` — clean.
- `npx expo export --platform ios --platform android` — both native bundles build.
- All screens render with zero runtime errors (checked via the web target).

## Structure

```
App.tsx                     font loading + navigation stack (16 routes)
src/theme.ts                Atelier color + font + radius tokens
src/navigation.ts           RootStackParamList + useNav() hook
src/icons.tsx               icon set (react-native-svg), ported from the source
src/components/
  ui.tsx                    Screen, ScreenScroll, PrimaryButton, Card, IconCircle, …
  Orb.tsx                   animated persimmon orb (breathe + rings + glow + voice bars)
src/screens/                Welcome, SignIn, SignUp, Home, ChooseMode, Setup,
                            Live, Results, Plans, Payment
```

## Flow

Welcome → Sign up / Sign in → Home → Choose a mode → Set up → **Live interview** →
Results. Profile tab → Plans → Payment.

## Notes for going further

This is the UI layer. The architecture brief (see the repo root) calls for a managed
WebRTC SFU (LiveKit), server-side STT + a Claude scoring pipeline, and on-device
proctoring — those plug in behind the `Live`, `Setup`, and `Results` screens. The
orb's `Speaking…/Listening…` state is where you'd bind real VAD/turn-taking events.
