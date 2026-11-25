import { Router } from 'express';
import { registrationRequestRoutes } from './adminRequests.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict, HttpError } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid, email, strongPassword, requiredText, nullableText, buildUpdate } from '../validation.js';
import { audit } from '../services/audit.js';
import { toPlan, toSubscription, SUBSCRIPTION_SELECT } from './billing.js';
import { RISK_ACTIONS, riskOf } from '../services/risk.js';
import { revokeAllForUser } from '../services/tokens.js';

const isoDate = z.string().datetime({ offset: true });
const LIVE = `('trialing', 'active', 'past_due', 'suspended')`;

const planFields = {
  name: z.string().trim().min(1).max(100),
  description: nullableText(500),
  priceCents: z.number().int().min(0).max(10_000_000),
  truckLimit: z.union([z.number().int().min(1).max(100000), z.null()]),
  // Percent taken off twelve months of the monthly price when a company pays for a year at once.
  yearlyDiscountPercent: z.number().int().min(0).max(90),
  product: z.enum(['trackova', 'loadova', 'both']),
  isInternalOnly: z.boolean(),
  isActive: z.boolean(),
};
const createPlan = z
  .object({
    ...planFields,
    truckLimit: planFields.truckLimit.default(null),
    yearlyDiscountPercent: planFields.yearlyDiscountPercent.default(0),
    product: planFields.product.default('trackova'),
    isInternalOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .strict();
const updatePlan = z.object(planFields).partial().strict();
const PLAN_COLUMNS = {
  name: 'name',
  description: 'description',
  priceCents: 'price_cents',
  truckLimit: 'truck_limit',
  yearlyDiscountPercent: 'yearly_discount_percent',
  product: 'product',
  isInternalOnly: 'is_internal_only',
  isActive: 'is_active',
};

const createCompanySchema = z
  .object({
    companyName: requiredText(200),
    adminName: requiredText(200),
    email,
    password: strongPassword,
    phone: nullableText(40),
    dotNumber: nullableText(40),
    mcNumber: nullableText(40),
    address: nullableText(500),
    // The platform's own company (for example NEB Trucking): no fee, on the internal $0 plan.
    isInternal: z.boolean().optional(),
  })
  .strict();

const assignSchema = z
  .object({
    planId: uuid,
    status: z.enum(['trialing', 'active', 'past_due', 'suspended']).default('active'),
    currentPeriodEnd: z.union([isoDate, z.null()]).optional(),
  })
  .strict();

const paymentSchema = z
  .object({
    companyId: uuid,
    amountCents: z.number().int().min(0).max(100_000_000),
    status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).default('succeeded'),
    providerReference: nullableText(100),
    paidAt: isoDate.optional(),
  })
  .strict();

const auditQuery = z.object({
  companyId: uuid.optional(),
  action: z.string().trim().min(1).max(80).optional(),
  risk: z.enum(['high', 'medium', 'low']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

// /admin — platform administration. Super Admin only.
export function adminRoutes({ db, config, authenticate, mailer }) {
  const router = Router();
  router.use(authenticate, requireRole('SUPER_ADMIN'));
  router.use(registrationRequestRoutes({ db, config, mailer }));

  router.get(
    '/overview',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(`
        SELECT (SELECT count(*)::int FROM companies) AS companies,
               (SELECT count(*)::int FROM companies WHERE status = 'active') AS active_companies,
               (SELECT count(*)::int FROM companies WHERE status = 'suspended') AS suspended_companies,
               (SELECT count(*)::int FROM trucks WHERE status <> 'inactive') AS active_trucks,
               (SELECT count(*)::int FROM drivers WHERE status = 'active') AS active_drivers,
               (SELECT count(*)::int FROM trips WHERE status = 'ACTIVE') AS active_trips,
               (SELECT count(*)::int FROM trips WHERE status = 'COMPLETED') AS completed_trips,
               (SELECT count(*)::int FROM location_history WHERE received_at > now() - interval '24 hours') AS gps_points_24h,
               (SELECT count(*)::int FROM registration_requests WHERE status = 'pending') AS pending_requests,
               (SELECT COALESCE(sum(price_cents), 0)::float8 FROM subscriptions WHERE status = 'active') AS monthly_revenue_cents`);
      const r = rows[0];
      res.json({
        companies: r.companies,
        activeCompanies: r.active_companies,
        suspendedCompanies: r.suspended_companies,
        activeTrucks: r.active_trucks,
        activeDrivers: r.active_drivers,
        activeTrips: r.active_trips,
        completedTrips: r.completed_trips,
        gpsPoints24h: r.gps_points_24h,
        pendingRequests: r.pending_requests,
        monthlyRevenueCents: r.monthly_revenue_cents,
      });
    }),
  );

  // ---- Create a company and its first Company Admin (the Super Admin onboards a client).
  router.post(
    '/companies',
    asyncHandler(async (req, res) => {
      const input = parse(createCompanySchema, req.body);
      const passwordHash = await bcrypt.hash(input.password, config.bcryptRounds);
      const created = await db.tx(async (q) => {
        const taken = await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email]);
        if (taken.rows.length) throw conflict('An account with this email already exists');
        const company = await q.query(
          `INSERT INTO companies (name, contact_email, contact_phone, address, dot_number, mc_number, is_internal)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [input.companyName, input.email, input.phone, input.address, input.dotNumber, input.mcNumber, !!input.isInternal],
        );
        const companyId = company.rows[0].id;
        if (input.isInternal) {
          const plan = (await q.query(`SELECT id FROM plans WHERE is_internal_only AND is_active ORDER BY created_at LIMIT 1`)).rows[0];
          if (!plan) throw conflict('There is no internal plan yet. Create one in Plans first.');
          await q.query(
            `INSERT INTO subscriptions (company_id, plan_id, status, price_cents, truck_limit) VALUES ($1, $2, 'active', 0, NULL)`,
            [companyId, plan.id],
          );
        }
        const user = await q.query(
          `INSERT INTO users (company_id, role, name, email, password_hash)
           VALUES ($1, 'COMPANY_ADMIN', $2, $3, $4) RETURNING id`,
          [companyId, input.adminName, input.email, passwordHash],
        );
        await audit(q, {
          companyId,
          actorUserId: req.auth.userId,
          action: 'COMPANY_CREATED',
          details: { companyName: input.companyName, adminUserId: user.rows[0].id },
          ip: req.ip,
        });
        return { companyId, adminUserId: user.rows[0].id };
      });
      res.status(201).json(created);
    }),
  );

  // ---- Plans
  router.get(
    '/plans',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query('SELECT * FROM plans ORDER BY is_internal_only DESC, price_cents, name');
      res.json({ plans: rows.map(toPlan) });
    }),
  );

  router.post(
    '/plans',
    asyncHandler(async (req, res) => {
      const p = parse(createPlan, req.body);
      const row = await db.tx(async (q) => {
        const { rows } = await q.query(
          `INSERT INTO plans (name, description, price_cents, truck_limit, yearly_discount_percent, product, is_internal_only, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [p.name, p.description, p.priceCents, p.truckLimit, p.yearlyDiscountPercent, p.product, p.isInternalOnly, p.isActive],
        );
        await audit(q, { actorUserId: req.auth.userId, action: 'PLAN_CREATED', details: { planId: rows[0].id, name: p.name }, ip: req.ip });
        return rows[0];
      });
      res.status(201).json({ plan: toPlan(row) });
    }),
  );

  // Plans are changed or switched off, never deleted: subscriptions refer to them.
  router.patch(
    '/plans/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const input = parse(updatePlan, req.body);
      const update = buildUpdate(PLAN_COLUMNS, input, req.body, 2);
      const row = await db.tx(async (q) => {
        const { rows } = await q.query(
          `UPDATE plans SET ${update.sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
          [id, ...update.values],
        );
        if (!rows[0]) throw notFound('Plan not found');
        await audit(q, { actorUserId: req.auth.userId, action: 'PLAN_UPDATED', details: { planId: id, fields: update.fields }, ip: req.ip });
        return rows[0];
      });
      res.json({ plan: toPlan(row) });
    }),
  );

  // ---- Company subscriptions
  router.get(
    '/subscriptions',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `${SUBSCRIPTION_SELECT.replace('SELECT s.id,', 'SELECT c.name AS company_name, s.id,')}
           JOIN companies c ON c.id = s.company_id
          ORDER BY s.created_at DESC LIMIT 500`,
      );
      res.json({ subscriptions: rows.map((r) => ({ ...toSubscription(r), companyName: r.company_name })) });
    }),
  );

  // Puts a company on a plan. The previous subscription is kept as history.
  router.put(
    '/companies/:id/subscription',
    asyncHandler(async (req, res) => {
      const companyId = parse(uuid, req.params.id);
      const input = parse(assignSchema, req.body);

      const row = await db.tx(async (q) => {
        const company = (await q.query('SELECT id, is_internal FROM companies WHERE id = $1 FOR UPDATE', [companyId])).rows[0];
        if (!company) throw notFound('Company not found');
        const plan = (await q.query('SELECT * FROM plans WHERE id = $1', [input.planId])).rows[0];
        if (!plan) throw notFound('Plan not found');
        if (!plan.is_active) throw conflict('This plan is not active');
        if (plan.is_internal_only && !company.is_internal) throw conflict('This plan is only for the internal company');

        if (plan.truck_limit != null) {
          const used = (
            await q.query(`SELECT count(*)::int AS n FROM trucks WHERE company_id = $1 AND status <> 'inactive'`, [companyId])
          ).rows[0].n;
          if (used > plan.truck_limit) {
            throw new HttpError(
              409,
              'TRUCK_LIMIT_BELOW_USAGE',
              `The company has ${used} active trucks, more than this plan allows (${plan.truck_limit}).`,
            );
          }
        }

        await q.query(
          `UPDATE subscriptions SET status = 'cancelled', cancelled_at = now(), updated_at = now()
            WHERE company_id = $1 AND status IN ${LIVE}`,
          [companyId],
        );
        const end =
          input.currentPeriodEnd === undefined
            ? company.is_internal
              ? null
              : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : input.currentPeriodEnd === null
            ? null
            : new Date(input.currentPeriodEnd);
        // Price and limit are copied, so a later plan edit never changes what a company already agreed to.
        const inserted = await q.query(
          `INSERT INTO subscriptions (company_id, plan_id, status, price_cents, truck_limit, current_period_end)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [companyId, plan.id, input.status, plan.price_cents, plan.truck_limit, end],
        );
        await audit(q, {
          companyId,
          actorUserId: req.auth.userId,
          action: 'SUBSCRIPTION_CHANGED',
          details: { plan: plan.name, status: input.status },
          ip: req.ip,
        });
        const { rows } = await q.query(`${SUBSCRIPTION_SELECT} WHERE s.id = $1`, [inserted.rows[0].id]);
        return rows[0];
      });
      res.json({ subscription: toSubscription(row) });
    }),
  );

  // ---- Payments (recorded by hand until a payment provider is chosen)
  router.get(
    '/payments',
    asyncHandler(async (req, res) => {
      const filter = req.query.companyId ? parse(uuid, req.query.companyId) : null;
      const { rows } = await db.query(
        `SELECT p.id, p.company_id, c.name AS company_name, p.amount_cents, p.currency, p.status, p.provider,
                p.provider_reference, p.paid_at, p.created_at
           FROM payments p JOIN companies c ON c.id = p.company_id
          WHERE ($1::uuid IS NULL OR p.company_id = $1::uuid)
          ORDER BY p.created_at DESC LIMIT 500`,
        [filter],
      );
      res.json({
        payments: rows.map((r) => ({
          id: r.id,
          companyId: r.company_id,
          companyName: r.company_name,
          amountCents: r.amount_cents,
          currency: r.currency,
          status: r.status,
          provider: r.provider,
          providerReference: r.provider_reference,
          paidAt: r.paid_at,
          createdAt: r.created_at,
        })),
      });
    }),
  );

  router.post(
    '/payments',
    asyncHandler(async (req, res) => {
      const p = parse(paymentSchema, req.body);
      const id = await db.tx(async (q) => {
        if (!(await q.query('SELECT 1 FROM companies WHERE id = $1', [p.companyId])).rows.length) throw notFound('Company not found');
        const sub = await q.query(`SELECT id FROM subscriptions WHERE company_id = $1 AND status IN ${LIVE}`, [p.companyId]);
        const paidAt = p.status === 'succeeded' ? (p.paidAt ? new Date(p.paidAt) : new Date()) : null;
        const { rows } = await q.query(
          `INSERT INTO payments (company_id, subscription_id, amount_cents, status, provider, provider_reference, paid_at)
           VALUES ($1, $2, $3, $4, 'manual', $5, $6) RETURNING id`,
          [p.companyId, sub.rows[0]?.id ?? null, p.amountCents, p.status, p.providerReference, paidAt],
        );
        await audit(q, {
          companyId: p.companyId,
          actorUserId: req.auth.userId,
          action: 'PAYMENT_RECORDED',
          details: { paymentId: rows[0].id, amountCents: p.amountCents, status: p.status },
          ip: req.ip,
        });
        return rows[0].id;
      });
      res.status(201).json({ id });
    }),
  );

  // ---- Notifications for the platform owner. Built from what already exists: new access requests, reviews to approve,
  // new companies, payments and plans that need attention. The page keeps its own "seen" time.
  router.get(
    '/notifications',
    asyncHandler(async (req, res) => {
      const out = [];
      const money = (c, cur) => `${(cur || 'USD').toUpperCase() === 'USD' ? '$' : ''}${(c / 100).toFixed(2)}`;
      const push = (rows, f) => rows.forEach((r) => out.push(f(r)));
      push(
        (await db.query(`SELECT id, company_name, contact_name, created_at FROM registration_requests WHERE status = 'pending' ORDER BY created_at DESC LIMIT 50`)).rows,
        (r) => ({ id: `req-${r.id}`, type: 'request', severity: 'warning', title: 'New access request', message: `${r.company_name} (${r.contact_name}) is waiting for approval.`, link: '/superadmin/requests', createdAt: r.created_at }),
      );
      push(
        (await db.query(`SELECT r.id, r.rating, r.updated_at, c.name AS company_name FROM reviews r JOIN companies c ON c.id = r.company_id WHERE r.status = 'pending' ORDER BY r.updated_at DESC LIMIT 50`)).rows,
        (r) => ({ id: `rev-${r.id}`, type: 'review', severity: 'info', title: 'Review to approve', message: `${r.company_name} wrote a ${r.rating}-star review.`, link: '/superadmin/reviews', createdAt: r.updated_at }),
      );
      push(
        (await db.query(`SELECT s.id, s.updated_at, c.name AS company_name FROM subscriptions s JOIN companies c ON c.id = s.company_id WHERE s.status = 'past_due' ORDER BY s.updated_at DESC LIMIT 50`)).rows,
        (r) => ({ id: `due-${r.id}`, type: 'payment_failed', severity: 'critical', title: 'Payment failed', message: `${r.company_name}'s last payment did not go through.`, link: '/superadmin/companies', createdAt: r.updated_at }),
      );
      push(
        (await db.query(`SELECT p.id, p.amount_cents, p.currency, p.created_at, c.name AS company_name FROM payments p JOIN companies c ON c.id = p.company_id WHERE p.status = 'succeeded' AND p.created_at > now() - interval '14 days' ORDER BY p.created_at DESC LIMIT 50`)).rows,
        (r) => ({ id: `pay-${r.id}`, type: 'payment', severity: 'info', title: 'Payment received', message: `${r.company_name} paid ${money(r.amount_cents, r.currency)}.`, link: '/superadmin/payments', createdAt: r.created_at }),
      );
      push(
        (await db.query(`SELECT id, name, created_at FROM companies WHERE created_at > now() - interval '14 days' ORDER BY created_at DESC LIMIT 50`)).rows,
        (r) => ({ id: `co-${r.id}`, type: 'company', severity: 'info', title: 'New company', message: `${r.name} created an account.`, link: '/superadmin/companies', createdAt: r.created_at }),
      );
      out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json({ notifications: out.slice(0, 100) });
    }),
  );

  // ---- Users: every person on the platform. Search, see where they belong, block or open an account.
  router.get(
    '/users',
    asyncHandler(async (req, res) => {
      const q = parse(
        z.object({
          search: z.string().trim().max(100).optional(),
          role: z.enum(['SUPER_ADMIN', 'COMPANY_ADMIN', 'DISPATCHER', 'DRIVER']).optional(),
          status: z.enum(['active', 'disabled']).optional(),
        }),
        req.query,
      );
      const { rows } = await db.query(
        `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.blocked_at, u.failed_logins, u.created_at, u.company_id, c.name AS company_name,
                (SELECT max(a.created_at) FROM audit_logs a WHERE a.actor_user_id = u.id AND a.action = 'LOGIN_SUCCESS') AS last_login_at
           FROM users u LEFT JOIN companies c ON c.id = u.company_id
          WHERE ($1::text IS NULL OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%' OR c.name ILIKE '%' || $1 || '%')
            AND ($2::text IS NULL OR u.role = $2) AND ($3::text IS NULL OR u.status = $3)
          ORDER BY u.created_at DESC LIMIT 300`,
        [q.search || null, q.role ?? null, q.status ?? null],
      );
      res.json({
        users: rows.map((r) => ({
          id: r.id, name: r.name, email: r.email, phone: r.phone, role: r.role, status: r.status,
          blocked: r.blocked_at != null, failedLogins: r.failed_logins, createdAt: r.created_at, lastLoginAt: r.last_login_at,
          companyId: r.company_id, companyName: r.company_name,
        })),
      });
    }),
  );
  router.post(
    '/users/:id/status',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { status } = parse(z.object({ status: z.enum(['active', 'disabled']) }).strict(), req.body);
      const target = (await db.query('SELECT id, role, company_id FROM users WHERE id = $1', [id])).rows[0];
      if (!target) throw notFound('User not found');
      if (target.role === 'SUPER_ADMIN') throw conflict('A platform owner account cannot be blocked here.');
      await db.tx(async (q) => {
        if (status === 'disabled') {
          await q.query(`UPDATE users SET status = 'disabled', updated_at = now() WHERE id = $1`, [id]);
          await revokeAllForUser(q, id);
        } else {
          await q.query(`UPDATE users SET status = 'active', blocked_at = NULL, failed_logins = 0, updated_at = now() WHERE id = $1`, [id]);
        }
        await audit(q, { companyId: target.company_id, actorUserId: req.auth.userId, action: 'USER_STATUS_CHANGED', details: { userId: id, status }, ip: req.ip });
      });
      res.status(204).end();
    }),
  );

  // ---- Accounts that blocked themselves after too many wrong passwords; the owner can open them again.
  router.get(
    '/blocked-users',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT u.id, u.name, u.email, u.role, u.blocked_at, c.name AS company_name FROM users u LEFT JOIN companies c ON c.id = u.company_id
          WHERE u.blocked_at IS NOT NULL AND u.status = 'disabled' ORDER BY u.blocked_at DESC LIMIT 100`,
      );
      res.json({ users: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, companyName: r.company_name, blockedAt: r.blocked_at })) });
    }),
  );
  router.post(
    '/blocked-users/:id/unblock',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { rows } = await db.query(
        `UPDATE users SET status = 'active', blocked_at = NULL, failed_logins = 0, updated_at = now() WHERE id = $1 AND blocked_at IS NOT NULL RETURNING id, company_id`,
        [id],
      );
      if (!rows[0]) throw notFound('This account is not blocked');
      await audit(db, { companyId: rows[0].company_id, actorUserId: req.auth.userId, action: 'ACCOUNT_UNBLOCKED', details: { userId: id }, ip: req.ip });
      res.status(204).end();
    }),
  );

  // ---- Audit summary: how much happened at each risk level, and who keeps failing to sign in.
  router.get(
    '/audit-summary',
    asyncHandler(async (req, res) => {
      const days = parse(z.coerce.number().int().min(1).max(90).default(7), req.query.days);
      const counts = (await db.query(`SELECT action, count(*)::int AS n FROM audit_logs WHERE created_at > now() - ($1::int * interval '1 day') GROUP BY action`, [days])).rows;
      const totals = { high: 0, medium: 0, low: 0 };
      counts.forEach((r) => (totals[riskOf(r.action)] += r.n));
      // The same address failing 5 or more times in the last 24 hours looks like someone guessing passwords.
      const failing = (
        await db.query(
          `SELECT ip_address, count(*)::int AS n, max(created_at) AS last_at FROM audit_logs
            WHERE action = 'LOGIN_FAILED' AND created_at > now() - interval '24 hours' AND ip_address IS NOT NULL
            GROUP BY ip_address HAVING count(*) >= 5 ORDER BY n DESC LIMIT 10`,
        )
      ).rows;
      res.json({
        days,
        totals,
        byAction: counts.map((r) => ({ action: r.action, risk: riskOf(r.action), count: r.n })).sort((a, b) => b.count - a.count).slice(0, 12),
        suspiciousIps: failing.map((r) => ({ ip: r.ip_address, failedLogins: r.n, lastAt: r.last_at })),
      });
    }),
  );

  // ---- Audit log
  router.get(
    '/audit-logs',
    asyncHandler(async (req, res) => {
      const f = parse(auditQuery, req.query);
      const params = [];
      const where = [];
      const add = (sql, value) => {
        params.push(value);
        where.push(sql.replace('?', `$${params.length}`));
      };
      if (f.companyId) add('a.company_id = ?', f.companyId);
      if (f.action) add('a.action = ?', f.action);
      if (f.risk === 'high' || f.risk === 'medium') add('a.action = ANY(?::text[])', RISK_ACTIONS[f.risk]);
      if (f.risk === 'low') add('NOT (a.action = ANY(?::text[]))', [...RISK_ACTIONS.high, ...RISK_ACTIONS.medium]);
      if (f.from) add('a.created_at >= ?', new Date(f.from));
      if (f.to) add('a.created_at <= ?', new Date(f.to));
      params.push(f.limit + 1, f.offset);
      const { rows } = await db.query(
        `SELECT a.id, a.action, a.details, a.ip_address, a.created_at, a.company_id, c.name AS company_name,
                u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
           FROM audit_logs a
           LEFT JOIN companies c ON c.id = a.company_id
           LEFT JOIN users u ON u.id = a.actor_user_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY a.created_at DESC, a.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );
      res.json({
        logs: rows.slice(0, f.limit).map((r) => ({
          id: r.id,
          action: r.action,
          risk: riskOf(r.action),
          details: r.details,
          ipAddress: r.ip_address,
          createdAt: r.created_at,
          companyId: r.company_id,
          companyName: r.company_name,
          actor: r.actor_name ? { name: r.actor_name, email: r.actor_email, role: r.actor_role } : null,
        })),
        hasMore: rows.length > f.limit,
      });
    }),
  );

  return router;
}
