import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, badRequest, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { revokeFamily } from '../services/tokens.js';
import { audit } from '../services/audit.js';
import { truckUsage } from '../services/fleet.js';

const COLUMNS = `id, name, status, is_internal, contact_email, contact_phone, address,
                 dot_number, mc_number, created_at, updated_at`;

function toCompany(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    isInternal: row.is_internal,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    address: row.address,
    dotNumber: row.dot_number,
    mcNumber: row.mc_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const nullableText = (max) => z.union([z.string().trim().max(max), z.null()]).transform((v) => (v ? v : null));

// Maps API field -> column. Only these fields can be changed by a Company
// Admin; status and is_internal belong to the Super Admin.
const EDITABLE = {
  name: 'name',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  address: 'address',
  dotNumber: 'dot_number',
  mcNumber: 'mc_number',
};

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    contactEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.null()]),
    contactPhone: nullableText(40),
    address: nullableText(500),
    dotNumber: nullableText(40),
    mcNumber: nullableText(40),
  })
  .partial()
  .strict();

// /companies — the signed-in Company Admin's own company. The company is
// always req.auth.companyId; there is deliberately no :id parameter.
export function companyRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN'));

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM companies WHERE id = $1`, [req.auth.companyId]);
      if (!rows[0]) throw notFound('Company not found');
      res.json({ company: toCompany(rows[0]), usage: await truckUsage(db, req.auth.companyId) });
    }),
  );

  router.patch(
    '/me',
    asyncHandler(async (req, res) => {
      const input = parse(updateSchema, req.body);
      const fields = Object.keys(input);
      if (!fields.length) throw badRequest('No fields to update');

      const sets = fields.map((f, i) => `${EDITABLE[f]} = $${i + 2}`);
      const values = fields.map((f) => input[f]);

      const company = await db.tx(async (q) => {
        const { rows } = await q.query(
          `UPDATE companies SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
          [req.auth.companyId, ...values],
        );
        if (!rows[0]) throw notFound('Company not found');
        await audit(q, {
          companyId: req.auth.companyId,
          actorUserId: req.auth.userId,
          action: 'COMPANY_UPDATED',
          details: { fields },
          ip: req.ip,
        });
        return rows[0];
      });
      res.json({ company: toCompany(company) });
    }),
  );

  return router;
}

const statusSchema = z.object({ status: z.enum(['pending', 'active', 'suspended']) }).strict();
const uuidParam = z.string().uuid();

// /admin/companies — platform-wide access for the Super Admin only.
export function adminCompanyRoutes({ db, authenticate, events }) {
  const router = Router();
  router.use(authenticate, requireRole('SUPER_ADMIN'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT c.id, c.name, c.status, c.is_internal, c.contact_email, c.contact_phone, c.address,
                c.dot_number, c.mc_number, c.created_at, c.updated_at,
                (SELECT count(*)::int FROM trucks t WHERE t.company_id = c.id AND t.status <> 'inactive') AS active_trucks,
                (SELECT count(*)::int FROM drivers d WHERE d.company_id = c.id AND d.status = 'active') AS active_drivers,
                s.status AS subscription_status, s.price_cents, s.truck_limit, s.current_period_end, p.name AS plan_name
           FROM companies c
           LEFT JOIN subscriptions s ON s.company_id = c.id AND s.status IN ('trialing', 'active', 'past_due', 'suspended')
           LEFT JOIN plans p ON p.id = s.plan_id
          ORDER BY c.created_at DESC`,
      );
      res.json({
        companies: rows.map((r) => ({
          ...toCompany(r),
          activeTrucks: r.active_trucks,
          activeDrivers: r.active_drivers,
          subscription: r.plan_name
            ? {
                planName: r.plan_name,
                status: r.subscription_status,
                priceCents: r.price_cents,
                truckLimit: r.truck_limit,
                currentPeriodEnd: r.current_period_end,
              }
            : null,
        })),
      });
    }),
  );

  router.patch(
    '/:id/status',
    asyncHandler(async (req, res) => {
      const id = parse(uuidParam, req.params.id);
      const { status } = parse(statusSchema, req.body);

      const company = await db.tx(async (q) => {
        const { rows } = await q.query(
          `UPDATE companies SET status = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
          [id, status],
        );
        if (!rows[0]) throw notFound('Company not found');
        if (status !== 'active') {
          // Close every open session of the company immediately.
          const families = await q.query(
            `SELECT DISTINCT rt.family_id FROM refresh_tokens rt
               JOIN users u ON u.id = rt.user_id
              WHERE u.company_id = $1 AND rt.revoked_at IS NULL`,
            [id],
          );
          for (const f of families.rows) await revokeFamily(q, f.family_id);
        }
        await audit(q, {
          companyId: id,
          actorUserId: req.auth.userId,
          action: 'COMPANY_STATUS_CHANGED',
          details: { status },
          ip: req.ip,
        });
        return rows[0];
      });
      // Close the company's live dashboard connections as well.
      if (status !== 'active') events.emit('company:access_revoked', { companyId: id });
      res.json({ company: toCompany(company) });
    }),
  );

  return router;
}
