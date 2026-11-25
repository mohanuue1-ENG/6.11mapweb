import React from 'react';
import { Link } from 'react-router-dom';
import { wrap } from './Home';
import { CONTACT, hasContact } from '../../services/contact';

export default function Contact({ embedded = false }) {
  const H = embedded ? 'h2' : 'h1';
  return (
    <div className={embedded ? '' : `${wrap} py-14`}>
      <div className="max-w-xl space-y-6">
        <div className="space-y-2">
          <H className="text-3xl sm:text-4xl font-extrabold tracking-tight">Contact</H>
          <p className="text-mute text-lg">Questions about plans or your account? Write or call us.</p>
        </div>
        {hasContact ? (
          <dl className="space-y-4 text-lg">
            {CONTACT.email && (
              <div>
                <dt className="text-sm text-mute">Email</dt>
                <dd><a href={`mailto:${CONTACT.email}`} className="font-semibold text-accent hover:underline">{CONTACT.email}</a></dd>
              </div>
            )}
            {CONTACT.phone && (
              <div>
                <dt className="text-sm text-mute">Phone</dt>
                <dd><a href={`tel:${CONTACT.phone.replace(/\s+/g, '')}`} className="font-semibold text-accent hover:underline">{CONTACT.phone}</a></dd>
              </div>
            )}
            {CONTACT.address && (
              <div>
                <dt className="text-sm text-mute">Address</dt>
                <dd className="font-semibold">{CONTACT.address}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="text-mute">
            Contact details will be published here soon. Until then you can{' '}
            <Link to="/create-account" className="text-accent font-semibold hover:underline">create an account</Link> and join from there.
          </p>
        )}
      </div>
    </div>
  );
}
