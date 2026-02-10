/**
 * Shared API configuration.
 *
 * The server port can be overridden via the URL query parameter `?port=XXXX`.
 * This allows running multiple La-Vak instances on the same machine for testing:
 *
 *   http://localhost:5173?port=3001   → connects to server on port 3001
 *   http://localhost:5173?port=3002   → connects to server on port 3002
 */

const params = new URLSearchParams(window.location.search);
const SERVER_PORT = params.get('port') || '3001';
const SERVER_HOST = window.location.hostname;

export const API_BASE = `http://${SERVER_HOST}:${SERVER_PORT}`;
export const WS_URL = `ws://${SERVER_HOST}:${SERVER_PORT}`;
