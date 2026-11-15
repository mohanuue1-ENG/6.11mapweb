import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Brand from '../../components/common/Brand';
import ThemeToggle from '../../components/common/ThemeToggle';

// Drivers work in the mobile app (location sharing, trips). This page only tells them so.
export default function DriverPortal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between h-16">
        <Brand />
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center pb-16">
        <div className="max-w-md w-full text-center space-y-5 p-8 rounded-3xl border border-line bg-surface">
          <span className="w-14 h-14 rounded-2xl bg-brand-green/15 text-accent inline-flex items-center justify-center">
            <Smartphone className="w-7 h-7" />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">Use the driver app</h1>
          <p className="text-sm text-mute leading-relaxed">
            {user?.name ? `${user.name}, trips` : 'Trips'} and location sharing run in the 6.11 Drive GPS app on your phone. Sign in there with this same email and password.
          </p>
          <button
            onClick={async () => {
              await logout();
              navigate('/');
            }}
            className="h-11 px-5 inline-flex items-center gap-2 rounded-xl border border-line text-sm font-medium hover:border-brand-green transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
