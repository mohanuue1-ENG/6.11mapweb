import { useEffect, useState } from 'react';
import { api } from '../../services/api';

const KEY = 'platform-notifications-seen';
export const seenTime = () => {
  try {
    return Number(localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};
export const markPlatformNotificationsSeen = () => {
  try {
    localStorage.setItem(KEY, String(Date.now()));
    window.dispatchEvent(new Event('platform-notifications-seen'));
  } catch {
    /* private mode: the count simply stays */
  }
};

// How many platform notifications are newer than the last time the owner opened the list. Checked every minute.
export function usePlatformUnread(enabled) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    const load = () =>
      api('/admin/notifications')
        .then((r) => {
          const seen = seenTime();
          if (live) setN(r.notifications.filter((x) => new Date(x.createdAt).getTime() > seen).length);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('platform-notifications-seen', load);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener('platform-notifications-seen', load);
    };
  }, [enabled]);
  return n;
}
