// Seeds the records the platform needs before anyone can sign in (PRD section 9):
// the internal $0 plan and — when its credentials are provided through environment
// variables — the Super Admin. Companies (NEB Trucking included) are added by the
// Super Admin in the website. Safe to run repeatedly.
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { revokeAllForUser } from '../services/tokens.js';

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

    const ensureUser = async ({ label, email, password, role, companyId, name, followEnvPassword = false }) => {
      if (!email || !password) {
        log(`skipped ${label}: set its email and password variables in .env to create it`);
        return;
      }
      if (password.length < 12) throw new Error(`${label} password must be at least 12 characters`);
      const normalized = email.trim().toLowerCase();
      const existing = await q.query('SELECT id, password_hash FROM users WHERE lower(email) = $1', [normalized]);
      if (existing.rows.length) {
        // The Super Admin password follows the server settings: a forgotten password is set again there.
        if (followEnvPassword && !(await bcrypt.compare(password, existing.rows[0].password_hash))) {
          await q.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [existing.rows[0].id, await bcrypt.hash(password, config.bcryptRounds)]);
          await revokeAllForUser(q, existing.rows[0].id);
          log(`${label} password set from the server settings`);
        } else {
          log(`${label} already exists`);
        }
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
      followEnvPassword: true,
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
