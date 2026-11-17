import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { asyncHandler, notFoundHandler, errorHandler } from './errors.js';
import { authenticate as makeAuthenticate } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { companyRoutes, adminCompanyRoutes } from './routes/companies.js';
import { truckRoutes } from './routes/trucks.js';
import { driverRoutes } from './routes/drivers.js';
import { assignmentRoutes } from './routes/assignments.js';
import { gpsRoutes, driverSelfRoutes } from './routes/gps.js';
import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { tripRoutes } from './routes/trips.js';
import { reportRoutes } from './routes/reports.js';
import { notificationRoutes } from './routes/notifications.js';
import { billingRoutes } from './routes/billing.js';
import { adminRoutes } from './routes/admin.js';
import { accessRoutes } from './routes/access.js';
import { createMailer } from './services/mailer.js';
import { createPaymentProvider } from './services/payments.js';
import { createGeocoder } from './services/geocode.js';
import { createSmsSender } from './services/sms.js';
import { signupRoutes } from './routes/signup.js';

export function createApp({ db, config, mailer = createMailer(config), payments = createPaymentProvider(config), geocoder = createGeocoder(config), sms = createSmsSender(config) }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.clientUrls, credentials: true }));
  // The payment provider signs the exact bytes it sends, so its webhook must reach the handler unparsed.
  app.use('/api/v1/signup/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }));
  // GPS batches carry up to a few hundred points, so they get a larger body limit.
  app.use('/api/v1/gps/locations/batch', express.json({ limit: '1mb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const limiter = (limit) =>
    rateLimit({
      windowMs: 60 * 1000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly' } },
    });

  const authenticate = makeAuthenticate({ db, config });
  // In-process event bus: routes announce changes after they are saved, and the
  // real-time layer (Socket.IO) forwards them to the right company room.
  const events = new EventEmitter();
  app.locals.events = events;
  const deps = { db, config, authenticate, events, mailer, payments, geocoder, sms };

  const api = express.Router();
  api.use(limiter(300));

  api.get(
    '/health',
    asyncHandler(async (req, res) => {
      await db.query('SELECT 1');
      res.json({ status: 'ok' });
    }),
  );

  // Stricter limit on the credential endpoints to slow down password guessing.
  const authLimiter = limiter(config.authRateLimitPerMinute);
  api.use(['/auth/login', '/auth/driver', '/auth/register', '/auth/refresh', '/auth/set-password', '/auth/forgot-password', '/auth/change-password', '/registration-requests'], authLimiter);
  api.use('/registration-requests', accessRoutes(deps));
  api.use('/signup', signupRoutes(deps));
  api.use('/auth', authRoutes(deps));
  api.use('/companies', companyRoutes(deps));
  api.use('/admin/companies', adminCompanyRoutes(deps));
  api.use('/trucks', truckRoutes(deps));
  api.use('/drivers', driverRoutes(deps));
  api.use('/assignments', assignmentRoutes(deps));
  // One driver cannot flood the endpoint, and drivers behind the same network address do not share a quota.
  api.use('/gps/locations/batch', rateLimit({
    windowMs: 60 * 1000,
    limit: config.gpsRateLimitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const auth = req.get('authorization');
      return auth ? 'auth:' + crypto.createHash('sha256').update(auth).digest('hex').slice(0, 24) : 'ip:' + req.ip;
    },
    message: { error: { code: 'RATE_LIMITED', message: 'Too many uploads, try again shortly' } },
  }));
  api.use('/gps', gpsRoutes(deps));
  api.use('/driver', driverSelfRoutes(deps));
  api.use('/trips', tripRoutes(deps));
  api.use('/reports', reportRoutes(deps));
  api.use('/notifications', notificationRoutes(deps));
  api.use(billingRoutes(deps));
  api.use('/admin', adminRoutes(deps));

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
