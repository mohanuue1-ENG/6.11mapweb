// What a password must be. The website shows the same rules while the person types (src/utils/passwordPolicy.js);
// this is the copy the server enforces, so a request that skips the website is held to them as well.
const COMMON = new Set(["000000", "00000000", "111111", "11111111", "11223344", "12121212", "123123", "12341234", "123456", "1234567", "12345678", "123456789", "1234567890", "1q2w3e", "1q2w3e4r", "1qaz2wsx", "611truckos", "654321", "a1b2c3d4", "aaaaaa", "aaaaaaaa", "abc123", "abc12345", "abcd1234", "abdi", "abdi123", "admin", "admin123", "administrator", "ahmed", "ahmed123", "aisha", "aisha123", "ali", "ali123", "amanda", "andrew", "angel", "angel123", "asdf1234", "asdfgh", "asdfghjkl", "ashley", "autumn", "bailey", "baseball", "batman", "changeme", "charlie", "company", "company123", "cookie", "dallas", "daniel", "default", "default123", "demo", "demo123", "donald", "dragon", "driver", "driver123", "example", "example123", "fatima", "fatima123", "fleet", "fleet123", "flower", "football", "freedom", "george", "ginger", "gps", "gps123", "guest", "hannah", "harley", "hassan", "hassan123", "hello", "hello123", "hunter", "iloveyou", "iloveyou1", "jennifer", "jessica", "jordan", "joshua", "killer", "lauren", "letmein", "login", "love", "love123", "lovely", "lovers", "master", "matthew", "michael", "mogadishu", "mohamed", "mohamed123", "mohamud", "mohamud123", "monkey", "mustang", "mypass", "mypassword", "nairobi", "newpassword", "nicole", "nopassword", "omar", "omar123", "p@ssw0rd", "p@ssword", "pass", "pass123", "pass1234", "passpass", "passw0rd", "password", "password1", "password12", "password123", "password1234", "passwordpassword", "pepper", "princess", "q1w2e3r4", "qazwsx", "qwer1234", "qwerty", "qwerty123", "qwertyuiop", "ranger", "robert", "root", "samantha", "sample", "sample123", "secret", "secret123", "shadow", "somalia", "soomaali", "soomaaliya", "spring", "starwars", "summer", "sunshine", "superman", "temp", "temp123", "test", "test123", "testing", "texas", "texas123", "thomas", "toor", "tracker", "tracking", "truck", "trucker", "trucker123", "trucking", "truckos", "trukova", "trustno1", "user", "user123", "welcome", "welcome1", "welcome123", "whatever", "winter", "zaq12wsx", "zxcv1234", "zxcvbnm"]);

// "P@ssw0rd!" and "password123" are the same word to an attacker: undo the usual swaps before looking it up.
const LEET = { '@': 'a', '4': 'a', '0': 'o', '1': 'l', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't' };
export function isCommonPassword(value) {
  const lower = String(value).toLowerCase();
  const plain = lower.replace(/[^a-z0-9]/g, '');
  const trimmed = lower.replace(/[^a-z0-9]+$/g, ''); // a trailing ! or ? is not part of the word
  const unleet = trimmed.replace(/[@40!13$57]/g, (c) => LEET[c]).replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');
  const noTail = lower.replace(/[^a-z]+$/g, '').replace(/[^a-z0-9]/g, '');
  const stripped = plain.replace(/\d+$/, '');
  if ([lower, plain, noTail, stripped].some((v) => v && COMMON.has(v))) return true;
  if (unleet.length >= 4 && COMMON.has(unleet)) return true;
  if (/^(.)\1+$/.test(plain)) return true; // aaaaaaaa
  if ('0123456789'.includes(plain) || '9876543210'.includes(plain) || 'abcdefghijklmnopqrstuvwxyz'.includes(plain)) return plain.length >= 6; // 12345678, abcdefgh
  return false;
}

// The rules a person is shown, in order. Each says what is missing, in plain words.
export function passwordProblems(value) {
  const p = String(value ?? '');
  const out = [];
  if (p.length < 8) out.push('at least 8 characters');
  if (Buffer.byteLength(p, 'utf8') > 72) out.push('no more than 72 characters');
  if (!/[A-Z]/.test(p)) out.push('an uppercase letter');
  if (!/[a-z]/.test(p)) out.push('a lowercase letter');
  if (!/\d/.test(p)) out.push('a number');
  if (!/[^A-Za-z0-9]/.test(p)) out.push('a special character (such as ! ? # %)');
  return out;
}
