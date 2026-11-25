import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { asyncHandler, notFoundHandler, errorHandler, HttpError } from './errors.js';
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
import { teamRoutes } from './routes/team.js';
import { reviewRoutes, adminReviewRoutes } from './routes/reviews.js';
import { requireRole } from './middleware/auth.js';
import { loadRoutes, driverLoadRoutes } from './routes/loads.js';
import { fuelRoutes, driverFuelRoutes } from './routes/fuel.js';
import { productsOf } from './services/plans.js';
import { adminRoutes } from './routes/admin.js';
import { accessRoutes } from './routes/access.js';
import { createMailer } from './services/mailer.js';
import { createPaymentProvider } from './services/payments.js';
import { createGeocoder } from './services/geocode.js';
import { signupRoutes } from './routes/signup.js';
import { verifyGoogleIdToken } from './services/google.js';

export function createApp({ db, config, mailer = createMailer(config), payments = createPaymentProvider(config), geocoder = createGeocoder(config), googleVerify = verifyGoogleIdToken }) {
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
  const deps = { db, config, authenticate, events, mailer, payments, geocoder, googleVerify };

  // The fleet's data is for companies that have paid for a plan (and for the platform itself). Until then the account can
  // sign in and choose a plan, but not use the fleet endpoints.
  const requireSubscription = (req, res, next) => {
    const u = req.auth?.user;
    if (!config.requireSubscription || !u || u.role === 'SUPER_ADMIN' || u.has_subscription) return next();
    return next(new HttpError(402, 'PAYMENT_REQUIRED', 'Choose a plan to open your dashboard.'));
  };
  const gate = [authenticate, requireSubscription];
  // Loads belong to Loadova: the company must have paid for Loadova (or both products).
  const requireLoadova = (req, res, next) => {
    const u = req.auth?.user;
    if (!config.requireSubscription || !u || u.role === 'SUPER_ADMIN' || productsOf(u.sub_product).includes('loadova')) return next();
    return next(new HttpError(402, 'PRODUCT_REQUIRED', 'Your plan does not include Loadova.'));
  };
  const loadGate = [authenticate, requireSubscription, requireLoadova];

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
  api.use(['/auth/login', '/auth/google', '/auth/driver', '/auth/register', '/auth/refresh', '/auth/set-password', '/auth/forgot-password', '/auth/change-password', '/registration-requests'], authLimiter);
  api.use('/registration-requests', accessRoutes(deps));
  api.use('/signup', signupRoutes(deps));
  api.use('/auth', authRoutes(deps));
  api.use('/companies', companyRoutes(deps));
  api.use('/team', ...gate, teamRoutes(deps));
  api.use('/reviews', reviewRoutes(deps));
  api.use('/admin/reviews', authenticate, requireRole('SUPER_ADMIN'), adminReviewRoutes(deps));
  api.use('/loads', ...loadGate, loadRoutes(deps));
  api.use('/driver/loads', ...loadGate, driverLoadRoutes(deps));
  api.use('/fuel', ...loadGate, fuelRoutes(deps));
  api.use('/driver/fuel', ...loadGate, driverFuelRoutes(deps));
  api.use('/admin/companies', adminCompanyRoutes(deps));
  api.use('/trucks', ...gate, truckRoutes(deps));
  api.use('/drivers', ...gate, driverRoutes(deps));
  api.use('/assignments', ...gate, assignmentRoutes(deps));
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
  api.use('/gps', ...gate, gpsRoutes(deps));
  api.use('/driver', ...gate, driverSelfRoutes(deps));
  api.use('/trips', ...gate, tripRoutes(deps));
  api.use('/reports', ...gate, reportRoutes(deps));
  api.use('/notifications', ...gate, notificationRoutes(deps));
  api.use(billingRoutes(deps));
  api.use('/admin', adminRoutes(deps));

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
