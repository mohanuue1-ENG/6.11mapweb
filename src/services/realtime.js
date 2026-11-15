// 6.11 Drive GPS - live updates over Socket.IO.
//
// The server only accepts a connection that presents a valid access token and
// closes it when that token expires. This module keeps the connection alive
// across those renewals and tells the caller when to re-read the snapshot.
import { io } from 'socket.io-client';
import { apiOrigin, getAccessToken, refreshSession } from './api';

const RETRY_GAP_MS = 3000;

// status: 'connecting' | 'live' | 'reconnecting' | 'offline'
export function connectLive({ onLocation, onTrip, onSubscribed, onStatus }) {
  let closed = false;
  let lastRenewal = 0;
  let retryTimer = null;

  const socket = io(apiOrigin(), {
    // Read the token at each attempt, so reconnects use the renewed one.
    auth: (cb) => cb({ token: getAccessToken() }),
    withCredentials: true,
    reconnectionDelayMax: 15000,
  });

  // The token was refused or has expired: renew it once, then connect again.
  // Spaced out so a persistent refusal can never become a tight loop.
  const renewAndReconnect = () => {
    if (closed || retryTimer) return;
    const wait = Math.max(0, RETRY_GAP_MS - (Date.now() - lastRenewal));
    retryTimer = setTimeout(async () => {
      retryTimer = null;
      lastRenewal = Date.now();
      try {
        await refreshSession();
      } catch {
        onStatus?.('offline');
        return;
      }
      if (!closed) socket.connect();
    }, wait);
  };

  socket.on('connect', () => {
    onStatus?.('live');
    // The server picks the room from our identity; nothing is sent with this.
    socket.emit('company:subscribe', null, () => onSubscribed?.());
  });
  socket.on('truck:location_updated', (location) => onLocation?.(location));
  socket.on('trip:started', (trip) => onTrip?.('started', trip));
  socket.on('trip:completed', (trip) => onTrip?.('completed', trip));
  socket.on('disconnect', (reason) => {
    if (closed) return;
    onStatus?.('reconnecting');
    // Closed by the server (token expired). Other reasons reconnect by themselves.
    if (reason === 'io server disconnect') renewAndReconnect();
  });
  socket.on('connect_error', (err) => {
    if (closed) return;
    const code = err?.data?.code;
    if (code === 'FORBIDDEN') {
      onStatus?.('offline');
      socket.disconnect();
    } else {
      onStatus?.('reconnecting');
      if (code === 'UNAUTHORIZED') renewAndReconnect();
    }
  });

  onStatus?.('connecting');
  return {
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket.close();
    },
  };
}
