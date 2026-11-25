import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { email, strongPassword, requiredText, uuid } from '../validation.js';
import { audit } from '../services/audit.js';
import { revokeAllForUser } from '../services/tokens.js';

const toDispatcher = (r) => ({ id: r.id, name: r.name, email: r.email, status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at });

const createSchema = z.object({ name: requiredText(200), email, password: strongPassword }).strict();
const statusSchema = z.object({ status: z.enum(['active', 'disabled']) }).strict();

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
      const { status } = parse(statusSchema, req.body);
      const row = await db.tx(async (q) => {
        const { rows } = await q.query(
          `UPDATE users SET status = $3, updated_at = now() WHERE id = $1 AND company_id = $2 AND role = 'DISPATCHER'
           RETURNING id, name, email, status, created_at, last_login_at`,
          [id, req.auth.companyId, status],
        );
        if (!rows[0]) throw notFound('Dispatcher not found');
        if (status === 'disabled') await revokeAllForUser(q, id);
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'DISPATCHER_STATUS', details: { dispatcherId: id, status }, ip: req.ip });
        return rows[0];
      });
      res.json({ dispatcher: toDispatcher(row) });
    }),
  );

  return router;
}
