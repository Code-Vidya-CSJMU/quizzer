// Centralized frontend config for backend URLs
// Use Vite env vars. For same-origin setups, leave them unset.
// VITE_API_BASE example: https://quiz.example.com
// VITE_SOCKET_URL example: https://quiz.example.com
// VITE_SOCKET_PATH example: /ws/socket.io

export const API_BASE = (import.meta as any).env?.VITE_API_BASE || ''
export const SOCKET_URL = (import.meta as any).env?.VITE_SOCKET_URL || API_BASE || '/'
export const SOCKET_PATH = (import.meta as any).env?.VITE_SOCKET_PATH || '/ws/socket.io'

export function api(path: string) {
  if (!path.startsWith('/')) path = '/' + path
  return `${API_BASE}${path}`
}
