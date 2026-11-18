import React from 'react';
import { Link } from 'react-router-dom';
import { wrap } from './Home';

const UPDATED = '18 November 2026';

const SECTIONS = [
  {
    title: 'Who we are',
    body: [
      'TRUKOVA (also called 6.11 Drive GPS) is a fleet tracking service. Trucking companies use the website to see where their trucks are and what they have done. Their drivers use the TRUKOVA mobile app, which shares the phone’s location while the driver chooses to share it.',
      'This policy explains what information the website and the app handle, why, and what choices you have. It applies to the TRUKOVA website and to the TRUKOVA driver app for Android and iOS.',
    ],
  },
  {
    title: 'Information we collect',
    list: [
      'Account details: a driver’s name, phone number and email address; a company administrator’s name and email address. Passwords are stored only as a one-way hash, never in plain text.',
      'Location: while a driver has location sharing on, the app records the phone’s position, speed, direction, accuracy and the time. This can include location while the app is in the background, so the company can follow a trip with the screen off. Location is not collected when sharing is off.',
      'Trips: when a trip starts and ends, its route and distance, and the truck it was driven with.',
      'Verification: one-time six-digit codes sent to a driver’s email address when they create an account or sign in, and a token that remembers a verified phone for up to 30 days if the driver chooses “Remember me”.',
      'Technical records: sign-in times, IP address, device type and actions taken in the admin website, kept to keep the service secure.',
      'Company details: the information a company gives when it asks for access, such as company name and contact details.',
    ],
  },
  {
    title: 'How we use it',
    list: [
      'To show a company where its trucks are, and to keep trip and location history for that company.',
      'To let drivers create an account, sign in and reset a forgotten password.',
      'To keep accounts secure, prevent misuse and investigate problems.',
      'To run and improve the service, and to contact you about your account.',
    ],
    after: 'We do not sell personal information and we do not show advertising. Location is never used for advertising.',
  },
  {
    title: 'Who sees a driver’s information',
    body: [
      'A driver’s location, trips and profile are visible to the administrators of the company the driver works for. A company cannot see another company’s data. Drivers can see their own information in the app.',
    ],
  },
  {
    title: 'Service providers we use',
    list: [
      'Hosting and database: Render, where the service and its data run.',
      'Email delivery: Mailjet, which sends the verification codes and account emails. It receives the recipient’s email address and the message.',
      'Place names: OpenStreetMap Nominatim, which turns coordinates into a street or city name. It receives the coordinates being looked up, not the driver’s name or account.',
      'Maps: map tiles are loaded from OpenStreetMap-based servers, which receive the area being viewed.',
    ],
    after: 'These providers process information only to provide their service to us. We share information with others only when the law requires it.',
  },
  {
    title: 'How long we keep it',
    body: [
      'Information is kept while the company’s account is active so the company has its trip and location history. When a company account is closed, or when a driver or company asks us to delete information, we delete it unless the law requires us to keep something. Verification codes expire after a few minutes.',
    ],
  },
  {
    title: 'Your choices and rights',
    list: [
      'Location sharing: a driver can stop sharing in the app at any time, and can switch location off in the phone’s settings.',
      'Access, correction and deletion: ask us (or your company administrator) to show, correct or delete your information, or to delete your driver account.',
      'Remembered phone: signing out of the app removes the saved session from the phone.',
    ],
    after: 'Depending on where you live you may have further rights under local law. To use any of these, use the details on our Contact page.',
  },
  {
    title: 'Security',
    body: [
      'Connections use HTTPS, passwords are hashed, sign-in sessions expire, and each company’s data is kept separate. No online service can promise perfect security, but we work to protect your information.',
    ],
  },
  {
    title: 'Children',
    body: ['TRUKOVA is for working adults. It is not directed to children under 16 and we do not knowingly collect their information.'],
  },
  {
    title: 'Changes to this policy',
    body: ['If we change this policy we will update the date at the top of this page and, for important changes, tell account holders.'],
  },
];

export default function Privacy() {
  return (
    <div className={`${wrap} py-14 space-y-8`}>
      <div className="max-w-3xl space-y-3">
        <h1 className="text-4xl font-extrabold tracking-tight">Privacy policy</h1>
        <p className="text-mute">Last updated {UPDATED}</p>
      </div>
      <div className="max-w-3xl space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title} className="space-y-3">
            <h2 className="text-xl font-bold">{s.title}</h2>
            {s.body?.map((p) => (
              <p key={p} className="text-mute leading-relaxed">{p}</p>
            ))}
            {s.list && (
              <ul className="list-disc pl-5 space-y-2 text-mute leading-relaxed">
                {s.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {s.after && <p className="text-mute leading-relaxed">{s.after}</p>}
          </section>
        ))}
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Contact us</h2>
          <p className="text-mute leading-relaxed">
            Questions or requests about this policy or your information: see our{' '}
            <Link to="/contact" className="text-brand-green hover:underline">Contact page</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
