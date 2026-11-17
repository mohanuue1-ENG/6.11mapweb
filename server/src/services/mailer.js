import nodemailer from 'nodemailer';

// Sends plain-text email through Mailjet's web API (it works where SMTP is blocked, such as Render's free plan),
// or through any SMTP service (Gmail, Postmark, your own…). Mailjet is used first when its keys are set, then SMTP.
// Without SMTP settings nothing is sent: the message is logged, and callers get
// { sent: false } so the screen can show the link to hand over manually.
// "TRUKOVA <you@gmail.com>" becomes { name, email }.
export function parseSender(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2].trim() } : { email: String(from || '').trim() };
}

// Mailjet: one HTTPS call, signed in with the API key and secret key. The sender address must be one verified in
// the Mailjet account (a Gmail address works).
function createMailjetMailer(config) {
  const sender = parseSender(config.mailFrom);
  const auth = Buffer.from(`${config.mailjetApiKey}:${config.mailjetSecretKey}`).toString('base64');
  return {
    configured: true,
    async send({ to, subject, text }) {
      try {
        const res = await fetch('https://api.mailjet.com/v3.1/send', {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            Messages: [{ From: { Email: sender.email, ...(sender.name ? { Name: sender.name } : {}) }, To: [{ Email: to }], Subject: subject, TextPart: text }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        const raw = await res.text().catch(() => '');
        let status = null;
        try {
          status = JSON.parse(raw).Messages?.[0]?.Status ?? null;
        } catch {
          status = null;
        }
        if (!res.ok || (status && status !== 'success')) {
          console.error(`[mail] Mailjet refused the message (${res.status}): ${raw.slice(0, 300)}`);
          return { sent: false };
        }
        return { sent: true };
      } catch (err) {
        console.error('[mail] send failed:', err.message);
        return { sent: false };
      }
    },
  };
}

export function createMailer(config) {
  if (config.mailjetApiKey && config.mailjetSecretKey) return createMailjetMailer(config);
  const transport = config.smtpHost
    ? nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      })
    : null;

  return {
    configured: !!transport,
    async send({ to, subject, text }) {
      if (!transport) {
        console.log(`[mail] not sent (SMTP not configured): to=${to} subject="${subject}"`);
        return { sent: false };
      }
      try {
        await transport.sendMail({ from: config.mailFrom, to, subject, text });
        return { sent: true };
      } catch (err) {
        // The caller carries on: a mail failure must never undo an approval.
        console.error('[mail] send failed:', err.message);
        return { sent: false };
      }
    },
  };
}
