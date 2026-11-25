import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { dateTime } from '../../services/format';
import { PageHeader, Panel } from '../../components/common/ui';
import { markPlatformNotificationsSeen, seenTime } from '../../components/common/platformNotifications';

const ICON = { info: Info, warning: AlertTriangle, critical: AlertCircle };
const COLOR = { info: 'text-blue-500', warning: 'text-amber-500', critical: 'text-red-500' };

export default function SuperAdminNotifications() {
  const { isDark } = useTheme();
  const [items, setItems] = useState(null);
  const [seenBefore] = useState(seenTime);

  useEffect(() => {
    api('/admin/notifications')
      .then((r) => {
        setItems(r.notifications);
        markPlatformNotificationsSeen();
      })
      .catch(() => setItems([]));
  }, []);

  const fresh = (items ?? []).filter((n) => new Date(n.createdAt).getTime() > seenBefore).length;
  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Bell} title="Notifications" subtitle={fresh ? `${fresh} new` : 'You are all caught up'} />
      <Panel className="p-0 overflow-hidden">
        {items === null ? (
          <p className="py-12 text-center text-xs text-gray-500">Loading…</p>
        ) : items.length === 0 ? (
          <p className={`py-12 text-center text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Nothing yet. New requests, reviews, companies and payments appear here.</p>
        ) : (
          <ul className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
            {items.map((n) => {
              const Icon = ICON[n.severity] || Info;
              const isNew = new Date(n.createdAt).getTime() > seenBefore;
              return (
                <li key={n.id}>
                  <Link to={n.link} className={`flex items-start gap-3 p-4 text-xs hover:bg-brand-green/5 ${isNew ? '' : 'opacity-60'}`}>
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${COLOR[n.severity] || COLOR.info}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold">{n.title}</span>
                        <span className="text-[10px] font-numbers text-gray-400 shrink-0">{dateTime(n.createdAt)}</span>
                      </div>
                      <p className={`mt-0.5 leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{n.message}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
