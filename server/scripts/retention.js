// Deletes stored GPS points older than a retention period.
//
//   node scripts/retention.js --days 365            (dry run: only counts)
//   node scripts/retention.js --days 365 --apply    (deletes, in batches)
//
// PRD section 14 leaves the GPS retention policy to be decided, so nothing runs
// automatically: choose the period, run a dry run, then schedule --apply.
// Trip records stay; only the point-by-point history is removed.
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/index.js';

const args = process.argv.slice(2);
const daysIdx = args.indexOf('--days');
const days = daysIdx >= 0 ? Number(args[daysIdx + 1]) : NaN;
const apply = args.includes('--apply');
if (!Number.isInteger(days) || days < 7) {
  console.error('Usage: node scripts/retention.js --days <7 or more> [--apply]');
  process.exit(1);
}

const db = await createDb(loadConfig());
try {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { rows } = await db.query('SELECT count(*)::int AS n FROM location_history WHERE gps_timestamp < $1', [cutoff]);
  console.log(`[retention] ${rows[0].n} points older than ${days} days (before ${cutoff.toISOString()})`);
  if (!apply) {
    console.log('[retention] dry run: nothing deleted. Add --apply to delete.');
  } else {
    let total = 0;
    for (;;) {
      const res = await db.query(
        `DELETE FROM location_history WHERE id IN (
           SELECT id FROM location_history WHERE gps_timestamp < $1 LIMIT 5000)`,
        [cutoff],
      );
      total += res.rowCount;
      if (res.rowCount < 5000) break;
    }
    console.log(`[retention] deleted ${total} points`);
  }
} finally {
  await db.close();
}
