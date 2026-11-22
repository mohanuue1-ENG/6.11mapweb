// 6.11 TruckOS - API client for the backend (/api/v1).
//
// The access token lives only in memory. The refresh token is an httpOnly
// cookie the browser sends by itself, so JavaScript never sees it and nothing
// sensitive is kept in localStorage.

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

let accessToken = null;
let refreshPromise = null;
let onSessionExpired = null;

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

// Origin of the API server, which also hosts the Socket.IO endpoint.
export function apiOrigin() {
  return new URL(BASE, window.location.origin).origin;
}

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

async function send(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback =
      res.status >= 500 ? 'The server is not available right now. Please try again.' : `Request failed (${res.status})`;
    throw new ApiError(res.status, data?.error?.code || 'ERROR', data?.error?.message || fallback, data?.error?.details);
  }
  return data;
}

// Exchanges the refresh cookie for a new access token. Refresh tokens are
// single-use, so concurrent callers must share one request: a second request
// with the same cookie would look like token theft and close the session.
export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = send('/auth/refresh', { method: 'POST', auth: false })
      .then((data) => {
        accessToken = data.accessToken;
        return data;
      })
      .catch((err) => {
        accessToken = null;
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Authenticated request. If the access token has expired it is renewed once
// and the request is repeated.
export async function api(path, options = {}) {
  try {
    return await send(path, options);
  } catch (err) {
    const canRenew = err.status === 401 && options.auth !== false && !path.startsWith('/auth/');
    if (!canRenew) throw err;
    try {
      await refreshSession();
    } catch {
      onSessionExpired?.();
      throw err;
    }
    return send(path, options);
  }
}

// Downloads a file the API produces (CSV exports) with the signed-in user's token.
export async function downloadFile(path, filename) {
  const get = () => fetch(BASE + path, { credentials: 'include', headers: { Authorization: `Bearer ${accessToken}` } });
  let res;
  try {
    res = await get();
    if (res.status === 401) {
      await refreshSession();
      res = await get();
    }
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) throw new ApiError(res.status, 'ERROR', 'The download failed. Please try again.');
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Turns an API error into one line for a form, naming the invalid field when the server did.
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!(err instanceof ApiError)) return fallback;
  const first = err.details?.[0];
  if (first?.message) return first.message;
  return err.message || fallback;
}
