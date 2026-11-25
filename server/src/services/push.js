// Reminders to a driver's phone (Expo push service). A message never carries money or passwords.
// Switched on in production by default; set PUSH_NOTIFICATIONS=false to turn it off, or =true to turn it on elsewhere.
export function createPusher(config, { fetchImpl = globalThis.fetch } = {}) {
  const enabled = config.pushNotifications ?? config.isProduction;
  return {
    enabled,
    // Sends to every phone the user has signed in on. Never throws: a failed reminder must not fail the request.
    async send(db, userId, { title, body, data = {} }) {
      if (!enabled || !userId) return { sent: 0 };
      try {
        const { rows } = await db.query('SELECT token FROM push_tokens WHERE user_id = $1', [userId]);
        if (!rows.length) return { sent: 0 };
        const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(rows.map((r) => ({ to: r.token, title, body, data, sound: 'default', priority: 'high', channelId: 'loads', categoryId: data.category })) ),
        });
        const json = await res.json().catch(() => null);
        // A phone that no longer exists is forgotten.
        const dead = (json?.data ?? []).map((t, i) => (t?.details?.error === 'DeviceNotRegistered' ? rows[i].token : null)).filter(Boolean);
        if (dead.length) await db.query('DELETE FROM push_tokens WHERE token = ANY($1::text[])', [dead]);
        return { sent: rows.length };
      } catch (err) {
        console.error('[push] could not send:', err.message);
        return { sent: 0 };
      }
    },
  };
}
