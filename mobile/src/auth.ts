// Lightweight in-memory auth store. Holds the access token + userId for the
// app session so api.ts can attach Authorization and scope requests to the
// signed-in user. (Persisting across launches via expo-secure-store is the
// production upgrade; in-memory keeps it Expo-Go friendly.)
let token: string | null = null;
let userId: string | null = null;

export function setAuth(t: string, u: string): void { token = t; userId = u; }
export function clearAuth(): void { token = null; userId = null; }
export function getToken(): string | null { return token; }
export function getUserId(): string { return userId ?? 'demo-user'; }
export function isAuthed(): boolean { return !!token; }
