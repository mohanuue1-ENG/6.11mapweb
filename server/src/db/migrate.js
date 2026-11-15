import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');

// Applies every migrations/NNN_name.sql that has not run yet, in filename order.
// Each file runs inside its own transaction together with its bookkeeping row.
export async function runMigrations(db, { log = () => {} } = {}) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await db.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.tx(async (q) => {
        await q.exec(sql);
        await q.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      });
    } catch (err) {
      throw new Error(`Migration ${file} failed: ${err.message}`);
    }
    log(`applied ${file}`);
    ran.push(file);
  }
  return ran;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadConfig } = await import('../config.js');
  const { createDb } = await import('./index.js');
  const db = await createDb(loadConfig());
  try {
    const ran = await runMigrations(db, { log: (m) => console.log(`[migrate] ${m}`) });
    console.log(ran.length ? `[migrate] done (${ran.length} applied)` : '[migrate] already up to date');
  } finally {
    await db.close();
  }
}
