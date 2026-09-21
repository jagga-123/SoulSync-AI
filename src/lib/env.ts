export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:5000/api";

// Socket.IO connects to the bare origin, not the "/api" REST prefix.
export const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL?.replace(/\/$/, "") ?? API_URL.replace(/\/api$/, "");
