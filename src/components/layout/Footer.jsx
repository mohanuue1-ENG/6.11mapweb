import React from 'react';
import { Link } from 'react-router-dom';
import Brand from '../common/Brand';
import { CONTACT, hasContact } from '../../services/contact';

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-2">
          <Brand />
          <p className="text-sm text-mute max-w-sm">Live locations, trips and reports for trucking companies.</p>
          {hasContact && (
            <p className="text-sm space-y-0.5">
              {CONTACT.email && <a href={`mailto:${CONTACT.email}`} className="block font-semibold text-link hover:underline">{CONTACT.email}</a>}
              {CONTACT.phone && <a href={`tel:${CONTACT.phone.replace(/\s+/g, '')}`} className="block font-semibold text-link hover:underline">{CONTACT.phone}</a>}
              {CONTACT.address && <span className="block text-mute">{CONTACT.address}</span>}
            </p>
          )}
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-mute">
          <Link to="/features" className="hover:text-ink">Features</Link>
          <Link to="/pricing" className="hover:text-ink">Pricing</Link>
          <Link to="/about" className="hover:text-ink">About</Link>
          <Link to="/download" className="hover:text-ink">Get the app</Link>
          <Link to="/contact" className="hover:text-ink">Contact</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <Link to="/create-account" className="hover:text-ink">Create account</Link>
          <Link to="/login" className="hover:text-ink">Sign in</Link>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-xs text-mute">© {new Date().getFullYear()} 6.11 TruckOS</p>
      </div>
    </footer>
  );
}
