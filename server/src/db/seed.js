// Seeds the records the platform needs before anyone can sign in (PRD section 9):
// the internal $0 plan, NEB Trucking with its subscription, and — when their
// credentials are provided through environment variables — the Super Admin
// and the NEB Company Admin. Safe to run repeatedly.
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';

export async function seed(db, config, env = process.env, log = () => {}) {
  await db.tx(async (q) => {
    let plan = (await q.query(`SELECT id FROM plans WHERE name = 'NEB Internal Fleet'`)).rows[0];
    if (!plan) {
      plan = (
        await q.query(
          `INSERT INTO plans (name, description, price_cents, truck_limit, is_internal_only)
           VALUES ('NEB Internal Fleet', 'Internal zero-fee access for NEB Trucking.', 0, NULL, true)
           RETURNING id`,
        )
      ).rows[0];
      log('created plan "NEB Internal Fleet" ($0)');
    }

    let neb = (await q.query(`SELECT id FROM companies WHERE is_internal AND name = 'NEB Trucking'`)).rows[0];
    if (!neb) {
      neb = (
        await q.query(`INSERT INTO companies (name, is_internal, status) VALUES ('NEB Trucking', true, 'active') RETURNING id`)
      ).rows[0];
      log('created company "NEB Trucking"');
    }

    const sub = await q.query(`SELECT 1 FROM subscriptions WHERE company_id = $1 AND status = 'active'`, [neb.id]);
    if (!sub.rows.length) {
      await q.query(
        `INSERT INTO subscriptions (company_id, plan_id, status, price_cents, truck_limit)
         VALUES ($1, $2, 'active', 0, NULL)`,
        [neb.id, plan.id],
      );
      log('created $0 subscription for NEB Trucking');
    }

    const ensureUser = async ({ label, email, password, role, companyId, name }) => {
      if (!email || !password) {
        log(`skipped ${label}: set its email and password variables in .env to create it`);
        return;
      }
      if (password.length < 12) throw new Error(`${label} password must be at least 12 characters`);
      const normalized = email.trim().toLowerCase();
      const existing = await q.query('SELECT 1 FROM users WHERE lower(email) = $1', [normalized]);
      if (existing.rows.length) {
        log(`${label} already exists`);
        return;
      }
      await q.query(
        `INSERT INTO users (company_id, role, name, email, password_hash) VALUES ($1, $2, $3, $4, $5)`,
        [companyId, role, name, normalized, await bcrypt.hash(password, config.bcryptRounds)],
      );
      log(`created ${label}`);
    };

    await ensureUser({
      label: 'Super Admin',
      email: env.SEED_SUPER_ADMIN_EMAIL,
      password: env.SEED_SUPER_ADMIN_PASSWORD,
      role: 'SUPER_ADMIN',
      companyId: null,
      name: '6.11 Super Admin',
    });
    await ensureUser({
      label: 'NEB Company Admin',
      email: env.SEED_NEB_ADMIN_EMAIL,
      password: env.SEED_NEB_ADMIN_PASSWORD,
      role: 'COMPANY_ADMIN',
      companyId: neb.id,
      name: 'NEB Admin',
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('./index.js');
  const { runMigrations } = await import('./migrate.js');
  const config = loadConfig();
  const db = await createDb(config);
  try {
    if (db.kind === 'pglite') await runMigrations(db);
    await seed(db, config, process.env, (m) => console.log(`[seed] ${m}`));
    console.log('[seed] done');
  } finally {
    await db.close();
  }
}
