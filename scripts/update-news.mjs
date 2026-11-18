// Pulls the Forex Factory weekly calendar feed and writes events.json
// (High impact = red folder 'r', Medium = gold folder 'g'; times converted to UTC).
import fs from 'node:fs';

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const OUT = 'events.json';

async function load() {
  if (process.env.FEED_FILE) return JSON.parse(fs.readFileSync(process.env.FEED_FILE, 'utf8'));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(FEED, { headers: { 'User-Agent': 'Mozilla/5.0 (ffx-sessions news updater)' } });
      if (res.ok) return await res.json();
      console.log(`Feed returned ${res.status} (attempt ${attempt})`);
    } catch (e) {
      console.log(`Feed error: ${e.message} (attempt ${attempt})`);
    }
    await new Promise(r => setTimeout(r, 5000 * attempt));
  }
  return null;
}

const raw = await load();
if (!Array.isArray(raw) || !raw.length) {
  console.log('No feed data this time; leaving events.json as it is.');
  process.exit(0);
}

const events = raw
  .filter(e => e.impact === 'High' || e.impact === 'Medium')
  .map(e => ({
    u: new Date(e.date).toISOString().replace('.000Z', 'Z'),
    c: e.country,
    i: e.impact === 'High' ? 'r' : 'g',
    t: e.title,
    ...(e.forecast ? { f: e.forecast } : {}),
    ...(e.previous ? { p: e.previous } : {})
  }))
  .sort((a, b) => a.u.localeCompare(b.u) || a.c.localeCompare(b.c));

const next = JSON.stringify({ source: 'Forex Factory calendar feed', events }, null, 1) + '\n';
const prev = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
if (next === prev) {
  console.log('Events unchanged.');
} else {
  fs.writeFileSync(OUT, next);
  console.log(`Wrote ${events.length} events.`);
}
