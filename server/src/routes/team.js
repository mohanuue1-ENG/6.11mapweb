import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict, badRequest } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { email, strongPassword, requiredText, uuid } from '../validation.js';
import { audit } from '../services/audit.js';
import { revokeAllForUser } from '../services/tokens.js';

const toDispatcher = (r) => ({ id: r.id, name: r.name, email: r.email, status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at });

const createSchema = z.object({ name: requiredText(200), email, password: strongPassword }).strict();
const updateSchema = z
  .object({ status: z.enum(['active', 'disabled']), name: requiredText(200), email, password: strongPassword })
  .partial()
  .strict();

// /team: the company owner (Company Admin) creates the dispatchers, who are employees that run the daily work.
export function teamRoutes({ db, config, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN'));

  router.get(
    '/dispatchers',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT id, name, email, status, created_at, last_login_at FROM users WHERE company_id = $1 AND role = 'DISPATCHER' ORDER BY created_at`,
        [req.auth.companyId],
      );
      res.json({ dispatchers: rows.map(toDispatcher) });
    }),
  );

  router.post(
    '/dispatchers',
    asyncHandler(async (req, res) => {
      const input = parse(createSchema, req.body);
      const hash = await bcrypt.hash(input.password, config.bcryptRounds);
      const row = await db.tx(async (q) => {
        if ((await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [input.email])).rows.length) throw conflict('An account with this email already exists');
        const { rows } = await q.query(
          `INSERT INTO users (company_id, role, name, email, password_hash) VALUES ($1, 'DISPATCHER', $2, $3, $4)
           RETURNING id, name, email, status, created_at, last_login_at`,
          [req.auth.companyId, input.name, input.email, hash],
        );
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'DISPATCHER_CREATED', details: { dispatcherId: rows[0].id }, ip: req.ip });
        return rows[0];
      });
      res.status(201).json({ dispatcher: toDispatcher(row) });
    }),
  );

  router.patch(
    '/dispatchers/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const input = parse(updateSchema, req.body);
      if (!Object.keys(input).length) throw badRequest('Nothing to change');
      const hash = input.password ? await bcrypt.hash(input.password, config.bcryptRounds) : null;
      const row = await db.tx(async (q) => {
        const cur = (await q.query(`SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role = 'DISPATCHER' FOR UPDATE`, [id, req.auth.companyId])).rows[0];
        if (!cur) throw notFound('Dispatcher not found');
        if (input.email && (await q.query('SELECT 1 FROM users WHERE lower(email) = $1 AND id <> $2', [input.email, id])).rows.length) throw conflict('An account with this email already exists');
        const { rows } = await q.query(
          `UPDATE users SET name = COALESCE($2, name), email = COALESCE($3, email), status = COALESCE($4, status),
                            password_hash = COALESCE($5, password_hash), failed_logins = CASE WHEN $4 = 'active' THEN 0 ELSE failed_logins END,
                            blocked_at = CASE WHEN $4 = 'active' THEN NULL ELSE blocked_at END, updated_at = now()
            WHERE id = $1 RETURNING id, name, email, status, created_at, last_login_at`,
          [id, input.name ?? null, input.email ?? null, input.status ?? null, hash],
        );
        // A switched-off person, or one whose password just changed, is signed out everywhere.
        if (input.status === 'disabled' || hash) await revokeAllForUser(q, id);
        await audit(q, {
          companyId: req.auth.companyId, actorUserId: req.auth.userId, action: input.status && Object.keys(input).length === 1 ? 'DISPATCHER_STATUS' : 'DISPATCHER_UPDATED',
          details: { dispatcherId: id, fields: Object.keys(input).filter((k) => k !== 'password'), passwordChanged: Boolean(hash) }, ip: req.ip,
        });
        return rows[0];
      });
      res.json({ dispatcher: toDispatcher(row) });
    }),
  );

  return router;
}
