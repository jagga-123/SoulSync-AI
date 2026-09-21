/**
 * The REST base URL — always ending in "/api", which is where the backend mounts its routes.
 * NEXT_PUBLIC_API_URL is documented as "https://<api-host>/api", but leaving off the "/api" is an easy
 * deployment slip (every request would then 404 with "Route not found"), so it is added when missing.
 */
function apiBase(value: string | undefined): string {
  const url = (value?.trim() || "http://localhost:5000/api").replace(/\/+$/, "");
  return /\/api$/i.test(url) ? url : `${url}/api`;
}

export const API_URL = apiBase(process.env.NEXT_PUBLIC_API_URL);

// Socket.IO connects to the bare origin, not the "/api" REST prefix.
export const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL?.trim().replace(/\/+$/, "") || API_URL.replace(/\/api$/i, "");
