// Runtime config. On a real iPhone, set EXPO_PUBLIC_API_URL to your Mac's LAN IP
// (e.g. http://192.168.1.23:4000) in mobile/.env — `localhost` only works in the
// iOS Simulator / web. Expo inlines EXPO_PUBLIC_* vars at build time.
const DEFAULT_API_URL = 'http://localhost:4000';

export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/$/, ''),
  // when false, the live-interview screens run in a UI-only demo mode (no backend)
  liveEnabled: (process.env.EXPO_PUBLIC_LIVE_ENABLED ?? 'true') === 'true',
};

export type AppConfig = typeof config;
