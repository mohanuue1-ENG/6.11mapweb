import React from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { wrap } from './Home';

// Set VITE_CONTACT_EMAIL at build time to publish a contact address. No address is invented here.
const EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';

export default function Contact() {
  return (
    <div className={`${wrap} py-14`}>
      <div className="max-w-xl space-y-5">
        <h1 className="text-4xl font-extrabold tracking-tight">Contact</h1>
        {EMAIL ? (
          <p className="text-mute text-lg">
            Questions about plans or your account? Write to{' '}
            <a href={`mailto:${EMAIL}`} className="inline-flex items-center gap-1.5 text-accent font-semibold hover:underline">
              <Mail className="w-4 h-4" /> {EMAIL}
            </a>
            .
          </p>
        ) : (
          <p className="text-mute text-lg">
            Contact details will be published here soon. In the meantime you can{' '}
            <Link to="/create-account" className="text-accent font-semibold hover:underline">create an account</Link> and join from there.
          </p>
        )}
      </div>
    </div>
  );
}
