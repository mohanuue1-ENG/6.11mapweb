import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Truck, Users, Route as RouteIcon, Radio, DollarSign, ShieldCheck, PauseCircle, Inbox } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { api, errorMessage } from '../../services/api';
import { dateTime, money } from '../../services/format';
import { ErrorBanner, PageHeader, Panel, Spinner } from '../../components/common/ui';
import StatCard from '../../components/common/StatCard';

export default function SuperAdminDashboard() {
  const { isDark } = useTheme();
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api('/admin/overview'), api('/admin/audit-logs?limit=8')])
      .then(([o, a]) => {
        setOverview(o);
        setLogs(a.logs);
      })
      .catch((err) => setError(errorMessage(err, 'Could not load the platform overview.')));
  }, []);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className="space-y-6 pb-12 font-sans">
      <PageHeader icon={ShieldCheck} title="Platform Overview" subtitle="All companies, fleets and activity across 6.11 Drive GPS" />
      <ErrorBanner message={error} />
      {!overview && !error && <Spinner />}
      {overview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/superadmin/requests" className="block">
              <StatCard title="Access requests" value={overview.pendingRequests} icon={Inbox} color={overview.pendingRequests ? 'amber' : 'gray'} subtitle={overview.pendingRequests ? 'Waiting for approval' : 'None waiting'} />
            </Link>
            <StatCard title="Companies" value={overview.companies} icon={Building2} color="green" subtitle={`${overview.activeCompanies} active`} />
            <StatCard title="Suspended" value={overview.suspendedCompanies} icon={PauseCircle} color={overview.suspendedCompanies ? 'amber' : 'gray'} />
            <StatCard title="Active trucks" value={overview.activeTrucks} icon={Truck} color="blue" />
            <StatCard title="Active drivers" value={overview.activeDrivers} icon={Users} color="blue" />
            <StatCard title="Trips in progress" value={overview.activeTrips} icon={RouteIcon} color="green" subtitle={`${overview.completedTrips} completed`} />
            <StatCard title="GPS points (24 h)" value={overview.gpsPoints24h.toLocaleString()} icon={Radio} color="gray" />
            <StatCard title="Monthly revenue" value={money(overview.monthlyRevenueCents)} icon={DollarSign} color="amber" subtitle="Active subscriptions" />
          </div>

          <Panel className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider">Recent activity</h3>
              <Link to="/superadmin/audit-logs" className="text-xs text-brand-green font-semibold hover:underline">Full audit log</Link>
            </div>
            {logs.length === 0 && <p className={`text-xs ${muted}`}>No activity yet.</p>}
            <ul className={`divide-y text-xs ${isDark ? 'divide-white/5' : 'divide-gray-100'}`}>
              {logs.map((l) => (
                <li key={l.id} className="py-2.5 flex items-center justify-between gap-3">
                  <span>
                    <span className="font-bold font-numbers">{l.action}</span>
                    <span className={muted}> · {l.companyName || 'Platform'}{l.actor ? ` · ${l.actor.name}` : ''}</span>
                  </span>
                  <span className={`font-numbers shrink-0 ${muted}`}>{dateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
