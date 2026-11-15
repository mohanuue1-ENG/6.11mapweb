import React from 'react';
import { Bell, CheckCheck, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import { useGps } from '../../context/GpsContext';
import { useTheme } from '../../context/ThemeContext';
import { dateTime } from '../../services/format';
import { PageHeader, Panel } from '../../components/common/ui';

const ICON = { info: Info, warning: AlertTriangle, critical: AlertCircle };
const COLOR = { info: 'text-blue-500', warning: 'text-amber-500', critical: 'text-red-500' };

export default function Notifications() {
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } = useGps();
  const { isDark } = useTheme();

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={Bell} title="Notifications" subtitle={unreadCount ? `${unreadCount} unread` : 'You are all caught up'}>
        <button
          onClick={markAllNotificationsRead}
          disabled={!unreadCount}
          className="px-4 py-2 text-xs font-bold rounded-xl border border-brand-green/40 text-brand-green hover:bg-brand-green/10 flex items-center gap-2 disabled:opacity-40"
        >
          <CheckCheck className="w-4 h-4" /> Mark all read
        </button>
      </PageHeader>

      <Panel className="p-0 overflow-hidden">
        {notifications.length === 0 ? (
          <p className={`py-12 text-center text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Nothing yet. You will be notified here when drivers start and finish trips.
          </p>
        ) : (
          <ul className={`divide-y ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
            {notifications.map((n) => {
              const Icon = ICON[n.severity] || Info;
              return (
                <li key={n.id} className={`flex items-start gap-3 p-4 text-xs ${n.read ? 'opacity-60' : ''}`}>
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${COLOR[n.severity] || COLOR.info}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold">{n.title}</span>
                      <span className="text-[10px] font-numbers text-gray-400 shrink-0">{dateTime(n.timestamp)}</span>
                    </div>
                    <p className={`mt-0.5 leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{n.message}</p>
                  </div>
                  {!n.read && (
                    <button onClick={() => markNotificationRead(n.id)} className="text-[11px] font-semibold text-brand-green hover:underline shrink-0">
                      Mark read
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
