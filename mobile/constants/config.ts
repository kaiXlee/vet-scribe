export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
export const API_KEY = process.env.EXPO_PUBLIC_API_KEY ?? 'change-me-to-a-secret-key';
export const WS_URL = API_URL.replace('http', 'ws').replace('https', 'wss');
