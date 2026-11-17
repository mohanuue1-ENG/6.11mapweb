import 'dotenv/config';
import crypto from 'node:crypto';

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  let jwtAccessSecret = env.JWT_ACCESS_SECRET || '';
  if (!jwtAccessSecret) {
    if (isProduction) throw new Error('JWT_ACCESS_SECRET is required in production');
    // Development only: sessions are invalidated on every restart.
    jwtAccessSecret = crypto.randomBytes(48).toString('base64url');
    console.warn('[config] JWT_ACCESS_SECRET not set; using a temporary secret for this run.');
  } else if (jwtAccessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  }

  const databaseUrl = env.DATABASE_URL || '';
  if (!databaseUrl && isProduction) throw new Error('DATABASE_URL is required in production');

  const sameSite = (env.COOKIE_SAMESITE || 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(sameSite)) {
    throw new Error('COOKIE_SAMESITE must be lax, strict or none');
  }

  const mailConfigured = !!(env.SMTP_HOST || (env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY));

  return {
    nodeEnv,
    isProduction,
    port: int(env.PORT, 4000),
    databaseUrl,
    databaseSsl: env.DATABASE_SSL !== 'false',
    pgliteDataDir: env.PGLITE_DATA_DIR || './.data/pglite',
    clientUrls: (env.CLIENT_URL || 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    jwtAccessSecret,
    accessTokenTtlSeconds: int(env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtlDays: int(env.REFRESH_TOKEN_TTL_DAYS, 30),
    cookieSameSite: sameSite,
    cookieSecure: isProduction || sameSite === 'none',
    bcryptRounds: int(env.BCRYPT_ROUNDS, 12),
    authRateLimitPerMinute: int(env.AUTH_RATE_LIMIT_PER_MINUTE, 20),
    // A trip start/end needs a GPS fix that is recent and accurate enough (PRD 4.3, 4.4).
    tripFixMaxAgeSeconds: int(env.TRIP_FIX_MAX_AGE_SECONDS, 120),
    tripFixMaxAccuracyMeters: int(env.TRIP_FIX_MAX_ACCURACY_METERS, 100),
    gpsRateLimitPerMinute: int(env.GPS_RATE_LIMIT_PER_MINUTE, 120),
    // Place names for positions. Empty turns them off. The public service needs a real contact in the User-Agent.
    geocoderUrl: env.GEOCODER_URL ?? (env.NODE_ENV === 'test' ? '' : 'https://nominatim.openstreetmap.org/reverse'),
    geocoderUserAgent: env.GEOCODER_USER_AGENT || '611-drive-gps/1.0 (fleet tracking)',
    gpsMaxBatchSize: int(env.GPS_MAX_BATCH_SIZE, 500),
    gpsMaxPointAgeDays: int(env.GPS_MAX_POINT_AGE_DAYS, 7),
    gpsMaxFutureSeconds: int(env.GPS_MAX_FUTURE_SECONDS, 300),
    // New companies join by request and approval. Instant self-registration is off unless this is set.
    allowSelfRegistration: env.ALLOW_SELF_REGISTRATION === 'true',
    // Online payment (Stripe). With a key set, Stripe is used; without one, local development
    // gets a fake checkout and production has online sign-up switched off.
    stripeSecretKey: env.STRIPE_SECRET_KEY || '',
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
    // Email (any SMTP service). Without smtpHost nothing is sent and screens show the link to hand over.
    smtpHost: env.SMTP_HOST || '',
    smtpPort: int(env.SMTP_PORT, 587),
    smtpUser: env.SMTP_USER || '',
    smtpPass: env.SMTP_PASS || '',
    // Mailjet web API (used before SMTP when both keys are set). MAIL_FROM must be a sender verified in Mailjet.
    mailjetApiKey: env.MAILJET_API_KEY || '',
    mailjetSecretKey: env.MAILJET_SECRET_KEY || '',
    mailFrom: env.MAIL_FROM || '6.11 Drive GPS <no-reply@localhost>',
    adminNotifyEmail: env.ADMIN_NOTIFY_EMAIL || '',
    // Public address of the website, used in links inside emails.
    appUrl: (env.APP_URL || (env.CLIENT_URL || 'http://localhost:3000').split(',')[0]).trim().replace(/\/+$/, ''),
    trialDays: int(env.TRIAL_DAYS, 7),
    // Drivers prove their email with a six-digit code when they create an account and when they sign in.
    // The codes are on whenever email (SMTP) is set up; DRIVER_LOGIN_CODES=false turns the sign-in code off.
    driverCodeLogin: env.DRIVER_LOGIN_CODES ? env.DRIVER_LOGIN_CODES === 'true' : mailConfigured,
    // For trying the flow before email is set up: the API hands the code back instead of emailing it.
    // Anyone who knows a driver's email could then create that driver's account, so never leave it on for real use.
    codeTestMode: env.CODE_TEST_MODE === 'true',
    codeTtlMinutes: int(env.CODE_TTL_MINUTES, 10),
    // How long a verified phone is remembered, and how long a driver's session can last without a new code.
    trustedDeviceDays: int(env.TRUSTED_DEVICE_DAYS, 30),
    trustProxy: isProduction ? 1 : false,
  };
}
