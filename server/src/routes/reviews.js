import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, parse, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { requiredText, uuid } from '../validation.js';
import { audit } from '../services/audit.js';

const input = z.object({ rating: z.number().int().min(1).max(5), body: requiredText(1000), displayName: requiredText(80) }).strict();

const toReview = (r) => ({ id: r.id, rating: r.rating, body: r.body, displayName: r.display_name, companyName: r.company_name ?? null, status: r.status, createdAt: r.created_at });

// /reviews: what customers say. Only approved reviews are public; a review is written by the company owner, one per company.
export function reviewRoutes({ db, authenticate }) {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(
        `SELECT r.*, c.name AS company_name FROM reviews r JOIN companies c ON c.id = r.company_id WHERE r.status = 'approved' ORDER BY r.updated_at DESC LIMIT 12`,
      );
      const stats = (await db.query(`SELECT count(*)::int AS n, COALESCE(avg(rating), 0)::float AS avg FROM reviews WHERE status = 'approved'`)).rows[0];
      res.json({ reviews: rows.map(toReview), count: stats.n, average: Math.round(stats.avg * 10) / 10 });
    }),
  );

  router.get(
    '/mine',
    authenticate,
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(`SELECT r.*, NULL AS company_name FROM reviews r WHERE r.company_id = $1`, [req.auth.companyId]);
      res.json({ review: rows[0] ? toReview(rows[0]) : null });
    }),
  );

  // Writing or changing a review sends it back to the platform admin to approve.
  router.post(
    '/',
    authenticate,
    requireRole('COMPANY_ADMIN'),
    asyncHandler(async (req, res) => {
      const v = parse(input, req.body);
      const row = await db.tx(async (q) => {
        const { rows } = await q.query(
          `INSERT INTO reviews (company_id, user_id, rating, body, display_name) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (company_id) DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, display_name = EXCLUDED.display_name, status = 'pending', updated_at = now()
           RETURNING *`,
          [req.auth.companyId, req.auth.userId, v.rating, v.body, v.displayName],
        );
        await audit(q, { companyId: req.auth.companyId, actorUserId: req.auth.userId, action: 'REVIEW_WRITTEN', details: { rating: v.rating }, ip: req.ip });
        return rows[0];
      });
      res.status(201).json({ review: toReview({ ...row, company_name: null }) });
    }),
  );

  return router;
}

// /admin/reviews: the platform admin reads the reviews and decides which are shown.
export function adminReviewRoutes({ db }) {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(`SELECT r.*, c.name AS company_name FROM reviews r JOIN companies c ON c.id = r.company_id ORDER BY (r.status = 'pending') DESC, r.updated_at DESC LIMIT 200`);
      res.json({ reviews: rows.map(toReview) });
    }),
  );
  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'hidden']) }).strict(), req.body);
      const { rows } = await db.query(`UPDATE reviews SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, status]);
      if (!rows[0]) throw notFound('Review not found');
      res.json({ review: toReview({ ...rows[0], company_name: null }) });
    }),
  );
  return router;
}
