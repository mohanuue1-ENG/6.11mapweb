import http from 'node:http';
import { loadConfig } from './config.js';
import { createDb } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';

const config = loadConfig();
const db = await createDb(config);

// The embedded development database migrates itself. A real PostgreSQL is
// migrated deliberately with "npm run migrate" (PRD section 11).
if (db.kind === 'pglite') {
  await runMigrations(db, { log: (m) => console.log(`[migrate] ${m}`) });
}

const app = createApp({ db, config });
const server = http.createServer(app);
const realtime = attachRealtime(server, { db, config, events: app.locals.events });

server.listen(config.port, () => {
  console.log(`[server] 6.11 Drive GPS API on http://localhost:${config.port}/api/v1 (${config.nodeEnv}, ${db.kind})`);
});

async function shutdown() {
  await realtime.close().catch(() => {});
  server.close(async () => {
    await db.close().catch(() => {});
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
