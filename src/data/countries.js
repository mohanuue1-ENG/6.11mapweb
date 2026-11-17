// Countries for the phone number's country-code picker: [ISO code, name, dial code].
const LIST = [
  ['SO', 'Somalia', '252'], ['US', 'United States', '1'], ['CA', 'Canada', '1'], ['KE', 'Kenya', '254'],
  ['ET', 'Ethiopia', '251'], ['DJ', 'Djibouti', '253'], ['ER', 'Eritrea', '291'], ['UG', 'Uganda', '256'],
  ['TZ', 'Tanzania', '255'], ['SD', 'Sudan', '249'], ['SS', 'South Sudan', '211'], ['RW', 'Rwanda', '250'],
  ['EG', 'Egypt', '20'], ['YE', 'Yemen', '967'], ['SA', 'Saudi Arabia', '966'], ['AE', 'United Arab Emirates', '971'],
  ['QA', 'Qatar', '974'], ['KW', 'Kuwait', '965'], ['OM', 'Oman', '968'], ['BH', 'Bahrain', '973'],
  ['JO', 'Jordan', '962'], ['LB', 'Lebanon', '961'], ['IQ', 'Iraq', '964'], ['TR', 'Türkiye', '90'],
  ['LY', 'Libya', '218'], ['MA', 'Morocco', '212'], ['DZ', 'Algeria', '213'], ['TN', 'Tunisia', '216'],
  ['NG', 'Nigeria', '234'], ['GH', 'Ghana', '233'], ['ZA', 'South Africa', '27'], ['ZM', 'Zambia', '260'],
  ['GB', 'United Kingdom', '44'], ['IE', 'Ireland', '353'], ['DE', 'Germany', '49'], ['FR', 'France', '33'],
  ['NL', 'Netherlands', '31'], ['BE', 'Belgium', '32'], ['CH', 'Switzerland', '41'], ['AT', 'Austria', '43'],
  ['SE', 'Sweden', '46'], ['NO', 'Norway', '47'], ['DK', 'Denmark', '45'], ['FI', 'Finland', '358'],
  ['IT', 'Italy', '39'], ['ES', 'Spain', '34'], ['AU', 'Australia', '61'], ['NZ', 'New Zealand', '64'],
  ['IN', 'India', '91'], ['PK', 'Pakistan', '92'], ['CN', 'China', '86'], ['JP', 'Japan', '81'],
  ['MY', 'Malaysia', '60'], ['SG', 'Singapore', '65'], ['MX', 'Mexico', '52'], ['BR', 'Brazil', '55'],
];

export const COUNTRIES = LIST.map(([code, name, dial]) => ({ code, name, dial }));

// A country's flag, from its two-letter code.
export const flag = (code) => [...code].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');

export const DEFAULT_DIAL = '1';

// "+252 61 234 5678" -> { dial: "252", national: "61 234 5678" }. The longest matching dial code wins.
export function splitPhone(full, fallbackDial = DEFAULT_DIAL) {
  const text = String(full || '').trim();
  const digits = text.replace(/\D/g, '');
  if (!text.startsWith('+') || !digits) return { dial: fallbackDial, national: text };
  const match = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find((c) => digits.startsWith(c.dial));
  if (!match) return { dial: fallbackDial, national: text };
  return { dial: match.dial, national: text.replace(/^\+\s*/, '').slice(match.dial.length).trim() };
}

// The number as it is stored: a plus, the country code, then the number without a leading zero.
export function joinPhone(dial, national) {
  const rest = String(national || '').replace(/[^\d\s-]/g, '').trim();
  const digits = rest.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${dial}${digits}` : '';
}
