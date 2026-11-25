import { Router } from 'express';
import { asyncHandler, parse, notFound } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid } from '../validation.js';

function toNotification(r) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    message: r.message,
    severity: r.severity,
    read: r.read_at != null,
    createdAt: r.created_at,
  };
}

// /notifications — a Company Admin's own. Rows with no user are shown to every
// admin of the company; the company always comes from the session.
export function notificationRoutes({ db, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN', 'DISPATCHER'));

  const visible = 'company_id = $1 AND (user_id IS NULL OR user_id = $2)';

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { companyId, userId } = req.auth;
      const { rows } = await db.query(
        `SELECT id, type, title, message, severity, read_at, created_at FROM notifications
          WHERE ${visible} ORDER BY created_at DESC, id LIMIT 200`,
        [companyId, userId],
      );
      const unread = await db.query(`SELECT count(*)::int AS n FROM notifications WHERE ${visible} AND read_at IS NULL`, [
        companyId,
        userId,
      ]);
      res.json({ notifications: rows.map(toNotification), unreadCount: unread.rows[0].n });
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (req, res) => {
      await db.query(`UPDATE notifications SET read_at = now() WHERE ${visible} AND read_at IS NULL`, [
        req.auth.companyId,
        req.auth.userId,
      ]);
      res.status(204).end();
    }),
  );

  router.patch(
    '/:id/read',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { rowCount } = await db.query(
        `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE ${visible} AND id = $3`,
        [req.auth.companyId, req.auth.userId, id],
      );
      if (!rowCount) throw notFound('Notification not found');
      res.status(204).end();
    }),
  );

  return router;
}
