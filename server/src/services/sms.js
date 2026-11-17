// Sends text messages. With Twilio credentials set, real messages go out; without them nothing is sent:
// in development the code is printed to the server log (and returned by the API so the flow can be tried),
// and in production the sign-up and sign-in codes are switched off with a clear message.
export function createSmsSender(config) {
  // Telnyx: one JSON call. The number the message comes from must belong to the Telnyx account.
  if (config.telnyxApiKey && config.telnyxFrom) {
    return {
      configured: true,
      async send({ to, body }) {
        const res = await fetch('https://api.telnyx.com/v2/messages', {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.telnyxApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: config.telnyxFrom,
            to,
            text: body,
            ...(config.telnyxMessagingProfileId ? { messaging_profile_id: config.telnyxMessagingProfileId } : {}),
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`SMS provider refused the message (${res.status}) ${detail.slice(0, 300)}`);
        }
        return { sent: true };
      },
    };
  }
  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioFrom) {
    const auth = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');
    return {
      configured: true,
      async send({ to, body }) {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: to, From: config.twilioFrom, Body: body }).toString(),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`SMS provider refused the message (${res.status}) ${detail.slice(0, 200)}`);
        }
        return { sent: true };
      },
    };
  }
  return {
    configured: false,
    async send({ to, body }) {
      if (config.nodeEnv === 'development') console.log(`[dev] SMS to ${to}: ${body}`);
      return { sent: false };
    },
  };
}
