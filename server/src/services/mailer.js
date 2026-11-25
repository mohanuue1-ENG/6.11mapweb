import nodemailer from 'nodemailer';

// Sends plain-text email through any SMTP service (Gmail with an app password, Postmark, your own…).
// Without SMTP settings nothing is sent: the message is logged, and callers get
// { sent: false } so the screen can show the link to hand over manually.
// "TRUKOVA <you@gmail.com>" becomes { name, email }.
export function parseSender(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].replace(/^"|"$/g, '') || undefined, email: m[2].trim() } : { email: String(from || '').trim() };
}

export function createMailer(config) {
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
    async send({ to, subject, text, html }) {
      if (!transport) {
        console.log(`[mail] not sent (SMTP not configured): to=${to} subject="${subject}"`);
        return { sent: false };
      }
      try {
        await transport.sendMail({ from: config.mailFrom, to, subject, text, html });
        return { sent: true };
      } catch (err) {
        // The caller carries on: a mail failure must never undo an approval.
        console.error('[mail] send failed:', err.message);
        return { sent: false };
      }
    },
  };
}
