/**
 * Data mode, from Vercel / .env:
 *   VITE_DATA_MODE=local   (default) - everything in this browser, as before
 *   VITE_DATA_MODE=remote  - data lives in the Zoho Catalyst backend at VITE_API_URL
 */
export const DATA_MODE: 'local' | 'remote' = import.meta.env.VITE_DATA_MODE === 'remote' ? 'remote' : 'local'
export const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
export const isRemote = () => DATA_MODE === 'remote' && !!API_URL
