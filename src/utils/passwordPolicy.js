// The password rules, shown while a person types. The server enforces the same rules (server/src/services/passwordPolicy.js).
const COMMON = new Set(["000000", "00000000", "111111", "11111111", "11223344", "12121212", "123123", "12341234", "123456", "1234567", "12345678", "123456789", "1234567890", "1q2w3e", "1q2w3e4r", "1qaz2wsx", "611truckos", "654321", "a1b2c3d4", "aaaaaa", "aaaaaaaa", "abc123", "abc12345", "abcd1234", "abdi", "abdi123", "admin", "admin123", "administrator", "ahmed", "ahmed123", "aisha", "aisha123", "ali", "ali123", "amanda", "andrew", "angel", "angel123", "asdf1234", "asdfgh", "asdfghjkl", "ashley", "autumn", "bailey", "baseball", "batman", "changeme", "charlie", "company", "company123", "cookie", "dallas", "daniel", "default", "default123", "demo", "demo123", "donald", "dragon", "driver", "driver123", "example", "example123", "fatima", "fatima123", "fleet", "fleet123", "flower", "football", "freedom", "george", "ginger", "gps", "gps123", "guest", "hannah", "harley", "hassan", "hassan123", "hello", "hello123", "hunter", "iloveyou", "iloveyou1", "jennifer", "jessica", "jordan", "joshua", "killer", "lauren", "letmein", "login", "love", "love123", "lovely", "lovers", "master", "matthew", "michael", "mogadishu", "mohamed", "mohamed123", "mohamud", "mohamud123", "monkey", "mustang", "mypass", "mypassword", "nairobi", "newpassword", "nicole", "nopassword", "omar", "omar123", "p@ssw0rd", "p@ssword", "pass", "pass123", "pass1234", "passpass", "passw0rd", "password", "password1", "password12", "password123", "password1234", "passwordpassword", "pepper", "princess", "q1w2e3r4", "qazwsx", "qwer1234", "qwerty", "qwerty123", "qwertyuiop", "ranger", "robert", "root", "samantha", "sample", "sample123", "secret", "secret123", "shadow", "somalia", "soomaali", "soomaaliya", "spring", "starwars", "summer", "sunshine", "superman", "temp", "temp123", "test", "test123", "testing", "texas", "texas123", "thomas", "toor", "tracker", "tracking", "truck", "trucker", "trucker123", "trucking", "truckos", "trukova", "trustno1", "user", "user123", "welcome", "welcome1", "welcome123", "whatever", "winter", "zaq12wsx", "zxcv1234", "zxcvbnm"]);

const LEET = { '@': 'a', '4': 'a', '0': 'o', '1': 'l', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't' };
export function isCommonPassword(value) {
  const lower = String(value).toLowerCase();
  const plain = lower.replace(/[^a-z0-9]/g, '');
  const trimmed = lower.replace(/[^a-z0-9]+$/g, '');
  const unleet = trimmed.replace(/[@40!13$57]/g, (c) => LEET[c]).replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');
  const noTail = lower.replace(/[^a-z]+$/g, '').replace(/[^a-z0-9]/g, '');
  const stripped = plain.replace(/\d+$/, '');
  if ([lower, plain, noTail, stripped].some((v) => v && COMMON.has(v))) return true;
  if (unleet.length >= 4 && COMMON.has(unleet)) return true;
  if (/^(.)\1+$/.test(plain)) return true;
  if ('0123456789'.includes(plain) || '9876543210'.includes(plain) || 'abcdefghijklmnopqrstuvwxyz'.includes(plain)) return plain.length >= 6;
  return false;
}

export const RULES = [
  { id: 'len', short: '8+', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'upper', short: 'A-Z', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'lower', short: 'a-z', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'digit', short: '0-9', label: 'A number', test: (p) => /\d/.test(p) },
  { id: 'special', short: '!?#', label: 'A special character (! ? # % …)', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export const tooLong = (p) => new TextEncoder().encode(p).length > 72;

// An honest verdict. "ok" means the form may be sent; the label and message say how good the password really is.
export function assess(password, { email = '' } = {}) {
  const p = String(password || '');
  const missing = RULES.filter((r) => !r.test(p));
  const local = String(email).split('@')[0].toLowerCase();
  if (!p) return { level: 0, ok: false, label: '', message: 'Choose a password.' };
  if (tooLong(p)) return { level: 1, ok: false, label: 'Too long', message: 'Use 72 characters or fewer.' };
  if (isCommonPassword(p)) return { level: 1, ok: false, label: 'Too common', message: 'This is one of the most commonly used passwords. Anyone can guess it. Choose another.' };
  if (local.length >= 4 && p.toLowerCase().includes(local)) return { level: 1, ok: false, label: 'Too guessable', message: 'It contains your email name. Choose something that is not about you.' };
  if (missing.length) return { level: p.length < 8 ? 1 : 2, ok: false, label: 'Weak', message: 'Still needs: ' + missing.map((r) => r.label.replace(/ \(.*\)/, '').toLowerCase()).join(', ') + '.' };
  if (p.length >= 16) return { level: 4, ok: true, label: 'Very strong', message: 'Long and varied. Good.' };
  if (p.length >= 12) return { level: 3, ok: true, label: 'Strong', message: 'Strong. Keep it somewhere safe, such as a password manager.' };
  return { level: 2, ok: true, label: 'Okay', message: 'It meets the rules, but a longer one (12 or more characters) is safer.' };
}

// A password that is strong and easy to read out loud: no 0/O, 1/l/I. Made with the browser's secure random.
export function suggestPassword(length = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!?#%+=@$*-'];
  const all = sets.join('');
  const pick = (chars) => {
    const n = new Uint32Array(1);
    let x;
    do {
      crypto.getRandomValues(n);
      x = n[0];
    } while (x >= Math.floor(0xffffffff / chars.length) * chars.length);
    return chars[x % chars.length];
  };
  const out = sets.map((s) => pick(s));
  while (out.length < length) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const j = n[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}
