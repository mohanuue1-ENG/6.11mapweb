// Checks a Google ID token (the "credential" the Google button gives the website). Google's own endpoint
// validates the signature; we then check it was made for OUR client id, by Google, and has not expired.
export async function verifyGoogleIdToken(idToken, clientId, fetchImpl = fetch) {
  if (!idToken || !clientId) return null;
  let t;
  try {
    const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    t = await res.json();
  } catch {
    return null;
  }
  if (t.aud !== clientId) return null;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) return null;
  if (Number(t.exp) * 1000 < Date.now()) return null;
  return {
    email: String(t.email || '').trim().toLowerCase(),
    emailVerified: t.email_verified === true || t.email_verified === 'true',
    name: String(t.name || '').trim(),
    sub: String(t.sub || ''),
  };
}
