import { Router } from 'express';
import { registrationRequestRoutes } from './adminRequests.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict, HttpError } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid, email, password, requiredText, nullableText, buildUpdate } from '../validation.js';
import { audit } from '../services/audit.js';
import { toPlan, toSubscription, SUBSCRIPTION_SELECT } from './billing.js';

const isoDate = z.string().datetime({ offset: true });
const LIVE = `('trialing', 'active', 'past_due', 'suspended')`;

const planFields = {
  name: z.string().trim().min(1).max(100),
  description: nullableText(500),
  priceCents: z.number().int().min(0).max(10_000_000),
  truckLimit: z.union([z.number().int().min(1).max(100000), z.null()]),
  isInternalOnly: z.boolean(),
  isActive: z.boolean(),
};
const createPlan = z
  .object({
    ...planFields,
    truckLimit: planFields.truckLimit.default(null),
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
  isInternalOnly: 'is_internal_only',
  isActive: 'is_active',
};

const createCompanySchema = z
  .object({
    companyName: requiredText(200),
    adminName: requiredText(200),
    email,
    password,
    phone: nullableText(40),
    dotNumber: nullableText(40),
    mcNumber: nullableText(40),
    address: nullableText(500),
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
          `INSERT INTO companies (name, contact_email, contact_phone, address, dot_number, mc_number)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [input.companyName, input.email, input.phone, input.address, input.dotNumber, input.mcNumber],
        );
        const companyId = company.rows[0].id;
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
          `INSERT INTO plans (name, description, price_cents, truck_limit, is_internal_only, is_active)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [p.name, p.description, p.priceCents, p.truckLimit, p.isInternalOnly, p.isActive],
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
