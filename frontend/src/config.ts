// Centralized frontend config for backend URLs (normalized)
// Use Vite env vars. For same-origin setups, leave them unset.
// VITE_API_BASE example: https://quiz.example.com (no trailing slash needed)
// VITE_SOCKET_URL example: https://quiz.example.com (no trailing slash needed)
// VITE_SOCKET_PATH example: /ws/socket.io

const rawApiBase = (import.meta as any).env?.VITE_API_BASE ?? ''
// strip trailing slashes to avoid double // when joining
export const API_BASE: string = rawApiBase.replace(/\/+$/, '')

const rawSocketUrl = (import.meta as any).env?.VITE_SOCKET_URL ?? ''
const normalizedSocketUrl = rawSocketUrl.replace(/\/+$/, '')
export const SOCKET_URL: string = normalizedSocketUrl || API_BASE || '/'

let rawSocketPath = (import.meta as any).env?.VITE_SOCKET_PATH ?? '/ws/socket.io'
// ensure single leading slash and no trailing slash
rawSocketPath = '/' + String(rawSocketPath).replace(/^\/+/, '').replace(/\/+$/, '')
export const SOCKET_PATH: string = rawSocketPath

export function api(path: string) {
  // ensure exactly one slash between base and path
  const p = path.startsWith('/') ? path : '/' + path
  return `${API_BASE}${p}`
}
