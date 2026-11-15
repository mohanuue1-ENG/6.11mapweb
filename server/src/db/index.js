// Database access. Production uses node-postgres against managed PostgreSQL.
// With no DATABASE_URL (development/tests) an embedded PostgreSQL (PGlite) is
// used, so the same SQL and migrations run everywhere.
//
// Both drivers are wrapped in one small interface:
//   db.query(sql, params) -> { rows, rowCount }
//   db.exec(sql)          -> run several statements (migrations)
//   db.tx(async (q) => …) -> transaction; q has query()
//   db.close()

function wrapPg(pool) {
  const run = (runner) => async (sql, params = []) => {
    const res = await runner.query(sql, params);
    return { rows: res.rows, rowCount: res.rowCount ?? 0 };
  };
  return {
    kind: 'pg',
    query: run(pool),
    exec: async (sql) => {
      await pool.query(sql);
    },
    tx: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: run(client), exec: (sql) => client.query(sql) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

function wrapPglite(lite) {
  const run = (runner) => async (sql, params = []) => {
    const res = await runner.query(sql, params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  };
  return {
    kind: 'pglite',
    query: run(lite),
    exec: async (sql) => {
      await lite.exec(sql);
    },
    tx: (fn) => lite.transaction((t) => fn({ query: run(t), exec: (sql) => t.exec(sql) })),
    close: () => lite.close(),
  };
}

export async function createDb(config, { memory = false } = {}) {
  if (config.databaseUrl && !memory) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
      max: 10,
    });
    return wrapPg(pool);
  }
  const { PGlite } = await import('@electric-sql/pglite');
  if (!memory) {
    // PGlite creates its own folder but not the folders above it.
    const { mkdir } = await import('node:fs/promises');
    const { dirname, resolve } = await import('node:path');
    await mkdir(dirname(resolve(config.pgliteDataDir)), { recursive: true });
  }
  const lite = memory ? new PGlite() : new PGlite(config.pgliteDataDir);
  await lite.waitReady;
  return wrapPglite(lite);
}
