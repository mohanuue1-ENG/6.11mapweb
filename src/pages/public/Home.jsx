import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, ChevronDown, Clock, MapPin, Route as RouteIcon, ShieldCheck, Smartphone } from 'lucide-react';

// Still used by the Features page.
export const FEATURES = [
  { icon: MapPin, title: 'Live map', text: 'See where each truck is right now, and how fresh that position is.' },
  { icon: RouteIcon, title: 'Trips', text: 'Every trip with its start, end, route, duration and distance.' },
  { icon: Clock, title: 'GPS history', text: 'Browse stored positions for any truck and period, and replay the route.' },
  { icon: BarChart3, title: 'Reports', text: 'Trip and fleet-activity summaries, with CSV export.' },
  { icon: Smartphone, title: 'Driver app', text: 'Drivers start and end trips from their phone. It keeps recording without signal and uploads later.' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Each company sees only its own trucks, drivers and trips.' },
];

export const wrap = 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8';

// Benefits, in the customer's words: what changes for them, not how the software works.
const BENEFITS = [
  { icon: ShieldCheck, title: 'Peace of mind', text: 'Know your trucks are where they should be, without a single phone call.' },
  { icon: Clock, title: 'Time back every day', text: 'Spend less time chasing updates and more time growing your business.' },
  { icon: RouteIcon, title: 'Proof, not guesswork', text: 'Every trip is recorded, so any question about a delivery has a clear answer.' },
  { icon: Smartphone, title: 'Easy for drivers', text: 'No new device to fit. Drivers just open the app on the phone they already carry.' },
];

const STEPS = [
  { title: 'Create your account', text: 'Choose Create account, then tell us about your company.' },
  { title: 'Pick a plan and pay', text: 'Your dashboard is ready as soon as the payment is confirmed.' },
  { title: 'Add your trucks and drivers', text: 'Your drivers share their location. You see the whole picture.' },
];

const FAQ = [
  { q: 'How do I get started?', a: 'Create your account, then tell us about your company, pick a plan and pay. As soon as the payment is confirmed your dashboard is ready, and you sign in with the email and password you chose.' },
  { q: 'Do I need to buy or install any hardware?', a: 'No. Location comes from the phone your driver already carries, through the driver app.' },
  { q: 'What happens when a driver has no signal?', a: 'The app keeps recording and sends everything when the connection returns. Nothing is lost or counted twice.' },
  { q: 'Who can see my fleet’s data?', a: 'Only people in your company. Every company’s information is kept separate.' },
  { q: 'How much does it cost?', a: 'Plans are monthly and depend on the number of trucks. See the Pricing page.' },
];

const btn = 'h-12 px-6 inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors';
const btnPrimary = `${btn} nudge bg-brand-green text-[#052E16] hover:bg-brand-green-hover`;
const btnPlain = `${btn} border border-line bg-surface text-ink hover:border-brand-green`;

export default function Home() {
  return (
    <>
      {/* Hero: one giant line, one centred paragraph, two buttons */}
      <section className="border-b border-line">
        <div className={`${wrap} py-20 lg:py-28 text-center stagger`}>
          <h1 className="mx-auto max-w-4xl text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]">
            Stop calling drivers to ask <span className="text-accent">where they are.</span>
          </h1>
          <p className="mx-auto max-w-2xl mt-6 text-lg sm:text-xl text-mute leading-relaxed">
            Know where every truck is, and what every trip looked like, from the phone your driver already has. No hardware to buy or install.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-9">
            <Link to="/create-account" className={btnPrimary}>
              Create account <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/pricing" className={btnPlain}>
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <section className={`${wrap} py-16 lg:py-20`}>
        <div className="max-w-2xl mb-10 space-y-2">
          <h2 className="text-3xl font-extrabold tracking-tight">Less worry. More control.</h2>
          <p className="text-mute">Your whole fleet in one clear view.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {BENEFITS.map(({ title, text }) => (
            <div key={title} className="pt-4 border-t-2 border-brand-green">
              <h3 className="font-bold mb-1.5">{title}</h3>
              <p className="text-sm text-mute leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${wrap} pb-16 lg:pb-20`}>
        <div className="rounded-xl bg-dark-surface2 text-white p-8 sm:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          <div className="max-w-xl space-y-3">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
              Built for the people who keep freight moving<span className="text-brand-green">.</span>
            </h2>
            <p className="text-gray-300">Less chasing, more driving. One simple way for your office and your drivers to stay in step.</p>
          </div>
          <div className="flex flex-wrap gap-3 shrink-0">
            <Link to="/create-account" className={btnPrimary}>
              Create account <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/download" className={`${btn} border border-white/30 text-white hover:bg-white/10`}>
              Get the driver app
            </Link>
          </div>
        </div>
      </section>

      <section id="how" className="border-y border-line bg-surface scroll-mt-24">
        <div className={`${wrap} py-16 lg:py-20`}>
          <h2 className="text-3xl font-extrabold tracking-tight mb-10">Up and running in three steps</h2>
          <ol className="grid md:grid-cols-3 gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="w-9 h-9 rounded-lg bg-brand-green text-[#052E16] font-bold inline-flex items-center justify-center shrink-0">{i + 1}</span>
                <div>
                  <h3 className="font-bold">{s.title}</h3>
                  <p className="text-sm text-mute mt-1 leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`${wrap} py-16 lg:py-20 max-w-3xl`}>
        <h2 className="text-3xl font-extrabold tracking-tight mb-8">Questions</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-line bg-surface px-5 py-4">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold">
                {f.q}
                <ChevronDown className="w-4 h-4 text-mute shrink-0 group-open:rotate-180" />
              </summary>
              <p className="text-sm text-mute leading-relaxed mt-3">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-surface">
        <div className={`${wrap} py-16 text-center space-y-5`}>
          <h2 className="text-3xl font-extrabold tracking-tight">Ready to see your whole fleet?</h2>
          <Link to="/create-account" className={btnPrimary}>
            Create account <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
