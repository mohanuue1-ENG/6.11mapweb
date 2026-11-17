import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { asyncHandler, parse, notFound, conflict } from '../errors.js';
import { requireRole } from '../middleware/auth.js';
import { uuid, email, password, requiredText, nullableText, nullableDate, buildUpdate } from '../validation.js';
import { assertNoActiveTrip, endActiveAssignments } from '../services/fleet.js';
import { revokeAllForUser } from '../services/tokens.js';
import { audit } from '../services/audit.js';

const SELECT = `
  SELECT d.id, d.name, d.phone, d.driver_number, d.license_number, d.license_state,
         to_char(d.license_expires_on, 'YYYY-MM-DD') AS license_expires_on,
         d.status, d.user_id, d.created_at, d.updated_at,
         u.email AS login_email,
         a.id AS assignment_id, t.id AS truck_id, t.truck_number
    FROM drivers d
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN driver_truck_assignments a ON a.driver_id = d.id AND a.active
    LEFT JOIN trucks t ON t.id = a.truck_id`;

function toDriver(r) {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    driverNumber: r.driver_number,
    licenseNumber: r.license_number,
    licenseState: r.license_state,
    licenseExpiresOn: r.license_expires_on,
    status: r.status,
    hasLogin: !!r.user_id,
    loginEmail: r.login_email,
    assignmentId: r.assignment_id,
    assignedTruck: r.truck_id ? { id: r.truck_id, truckNumber: r.truck_number } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const status = z.enum(['active', 'inactive']);
const fields = {
  name: requiredText(200),
  phone: nullableText(40),
  driverNumber: nullableText(40),
  licenseNumber: nullableText(60),
  licenseState: nullableText(40),
  licenseExpiresOn: nullableDate,
  status,
};
const login = z.object({ email, password }).strict();

const createSchema = z.object({ ...fields, status: status.default('active'), login: login.optional() }).strict();
// `login` on an update gives a driver who has no account yet their mobile sign-in.
const updateSchema = z.object({ ...fields, login }).partial().strict();

const COLUMNS = {
  name: 'name',
  phone: 'phone',
  driverNumber: 'driver_number',
  licenseNumber: 'license_number',
  licenseState: 'license_state',
  licenseExpiresOn: 'license_expires_on',
  status: 'status',
};

// /drivers — a Company Admin's own drivers, always scoped by req.auth.companyId.
export function driverRoutes({ db, config, authenticate }) {
  const router = Router();
  router.use(authenticate, requireRole('COMPANY_ADMIN'));

  const findOne = async (q, companyId, id) => {
    const { rows } = await q.query(`${SELECT} WHERE d.company_id = $1 AND d.id = $2`, [companyId, id]);
    if (!rows[0]) throw notFound('Driver not found');
    return rows[0];
  };

  const assertNumberFree = async (q, companyId, driverNumber, exceptId = null) => {
    if (!driverNumber) return;
    const { rows } = await q.query(
      `SELECT 1 FROM drivers WHERE company_id = $1 AND driver_number = $2 AND ($3::uuid IS NULL OR id <> $3::uuid)`,
      [companyId, driverNumber, exceptId],
    );
    if (rows.length) throw conflict(`Driver ID ${driverNumber} is already in use`);
    // The app finds a new driver by this number alone, so no other waiting driver may hold it.
    const other = await q.query(
      `SELECT 1 FROM drivers WHERE upper(driver_number) = upper($1) AND user_id IS NULL AND company_id <> $2 LIMIT 1`,
      [driverNumber, companyId],
    );
    if (other.rows.length) throw conflict('That driver number is already taken. Choose a different one.');
  };

  // Creates the DRIVER user the mobile app signs in with. The company comes
  // from the admin's session, never from the request.
  const createLogin = async (q, companyId, driver, credentials) => {
    const existing = await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [credentials.email]);
    if (existing.rows.length) throw conflict('An account with this email already exists');
    const hash = await bcrypt.hash(credentials.password, config.bcryptRounds);
    const { rows } = await q.query(
      `INSERT INTO users (company_id, role, name, email, phone, password_hash, status)
       VALUES ($1, 'DRIVER', $2, $3, NULL, $4, $5) RETURNING id`,
      [companyId, driver.name, credentials.email, hash, driver.status === 'active' ? 'active' : 'disabled'],
    );
    await q.query('UPDATE drivers SET user_id = $3 WHERE company_id = $1 AND id = $2', [companyId, driver.id, rows[0].id]);
  };

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { rows } = await db.query(`${SELECT} WHERE d.company_id = $1 ORDER BY d.name`, [req.auth.companyId]);
      res.json({ drivers: rows.map(toDriver) });
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const input = parse(createSchema, req.body);
      const { companyId, userId } = req.auth;

      const row = await db.tx(async (q) => {
        await assertNumberFree(q, companyId, input.driverNumber);
        const inserted = await q.query(
          `INSERT INTO drivers (company_id, name, phone, driver_number, license_number, license_state, license_expires_on, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            companyId,
            input.name,
            input.phone,
            input.driverNumber,
            input.licenseNumber,
            input.licenseState,
            input.licenseExpiresOn,
            input.status,
          ],
        );
        const id = inserted.rows[0].id;
        if (input.login) await createLogin(q, companyId, { id, name: input.name, status: input.status }, input.login);
        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'DRIVER_CREATED',
          details: { driverId: id, name: input.name, hasLogin: !!input.login },
          ip: req.ip,
        });
        return findOne(q, companyId, id);
      });
      res.status(201).json({ driver: toDriver(row) });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      res.json({ driver: toDriver(await findOne(db, req.auth.companyId, id)) });
    }),
  );

  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const input = parse(updateSchema, req.body);
      const { companyId, userId } = req.auth;
      const { login: credentials, ...profile } = input;
      const { login: _ignored, ...profileBody } = req.body ?? {};
      const update = Object.keys(profileBody).length ? buildUpdate(COLUMNS, profile, profileBody, 3) : null;
      if (!update && !credentials) buildUpdate(COLUMNS, {}, {}, 3); // throws "No fields to update"

      const row = await db.tx(async (q) => {
        const current = await findOne(q, companyId, id);

        if (profile.driverNumber && profile.driverNumber !== current.driver_number) {
          await assertNumberFree(q, companyId, profile.driverNumber, id);
        }
        const newStatus = profile.status ?? current.status;
        if (newStatus !== current.status && newStatus === 'inactive') {
          await assertNoActiveTrip(q, companyId, { driverId: id });
          await endActiveAssignments(q, companyId, { driverId: id });
        }

        if (update) {
          await q.query(
            `UPDATE drivers SET ${update.sets.join(', ')}, updated_at = now() WHERE company_id = $1 AND id = $2`,
            [companyId, id, ...update.values],
          );
        }

        if (credentials) {
          if (current.user_id) throw conflict('This driver already has a login');
          await createLogin(q, companyId, { id, name: profile.name ?? current.name, status: newStatus }, credentials);
        } else if (current.user_id) {
          // Keep the login in step with the driver record.
          await q.query(
            `UPDATE users SET name = $3, status = $4, updated_at = now() WHERE company_id = $1 AND id = $2`,
            [companyId, current.user_id, profile.name ?? current.name, newStatus === 'active' ? 'active' : 'disabled'],
          );
          if (newStatus !== 'active') await revokeAllForUser(q, current.user_id);
        }

        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'DRIVER_UPDATED',
          details: { driverId: id, fields: update?.fields ?? [], loginCreated: !!credentials },
          ip: req.ip,
        });
        return findOne(q, companyId, id);
      });
      res.json({ driver: toDriver(row) });
    }),
  );

  // Removes a driver (and their login) who has no trip or GPS history.
  // Drivers with history are refused by the database (409); deactivate those.
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = parse(uuid, req.params.id);
      const { companyId, userId } = req.auth;
      await db.tx(async (q) => {
        const current = await findOne(q, companyId, id);
        await q.query('DELETE FROM drivers WHERE company_id = $1 AND id = $2', [companyId, id]);
        if (current.user_id) {
          await q.query(`DELETE FROM users WHERE company_id = $1 AND id = $2 AND role = 'DRIVER'`, [
            companyId,
            current.user_id,
          ]);
        }
        await audit(q, {
          companyId,
          actorUserId: userId,
          action: 'DRIVER_DELETED',
          details: { driverId: id, name: current.name },
          ip: req.ip,
        });
      });
      res.status(204).end();
    }),
  );

  return router;
}
