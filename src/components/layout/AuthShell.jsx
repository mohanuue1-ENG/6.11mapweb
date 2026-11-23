import React from 'react';
import Navbar from './Navbar';

// Shared page for sign in and registration: everything in one centred column.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh flex flex-col bg-app text-ink">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-5 sm:px-8 py-10">
        <div className="w-full max-w-md anim-rise">
          <div className="mb-8 space-y-1.5 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-mute">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-sm text-mute text-center">{footer}</div>}
        </div>
      </main>
      <p className="py-5 text-center text-xs text-mute">© {new Date().getFullYear()} 6.11 TruckOS</p>
    </div>
  );
}
