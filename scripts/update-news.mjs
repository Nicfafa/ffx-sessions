// Pulls the Forex Factory weekly calendar feed and writes events.json
// (High impact = red folder 'r', Medium = gold folder 'g'; times converted to UTC).
import fs from 'node:fs';

const FEED = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const OUT = 'events.json';

const FEED_XML = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';
const UA = { 'User-Agent': 'Mozilla/5.0 (ffx-sessions news updater)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (res.ok) return await res.text();
      console.log(`${label}: HTTP ${res.status} (attempt ${attempt})`);
    } catch (e) {
      console.log(`${label}: ${e.message} (attempt ${attempt})`);
    }
    await sleep(5000 * attempt);
  }
  return null;
}

// The XML copy of the feed lists times in UTC as e.g. "9:30pm", with dates as MM-DD-YYYY.
function parseXml(text) {
  const out = [];
  for (const b of text.match(/<event>[\s\S]*?<\/event>/g) || []) {
    const tag = t => {
      const m = b.match(new RegExp(`<${t}>\\s*(?:<!\\[CDATA\\[)?\\s*([\\s\\S]*?)\\s*(?:\\]\\]>)?\\s*</${t}>`));
      return m ? m[1].trim() : '';
    };
    const d = tag('date').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    const t = tag('time').match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (!d || !t) continue; // all-day or tentative items have no usable time
    let h = Number(t[1]) % 12;
    if (t[3].toLowerCase() === 'pm') h += 12;
    const when = new Date(Date.UTC(+d[3], +d[1] - 1, +d[2], h, +t[2]));
    out.push({
      title: tag('title'), country: tag('country'), date: when.toISOString(),
      impact: tag('impact'), forecast: tag('forecast'), previous: tag('previous')
    });
  }
  return out;
}

async function load() {
  if (process.env.FEED_FILE) return JSON.parse(fs.readFileSync(process.env.FEED_FILE, 'utf8'));
  if (process.env.XML_FILE) return parseXml(fs.readFileSync(process.env.XML_FILE, 'utf8'));
  const json = await get(FEED, 'JSON feed');
  if (json) {
    try {
      const j = JSON.parse(json);
      if (Array.isArray(j) && j.length) { console.log('Source: JSON feed'); return j; }
    } catch (e) { console.log('JSON feed was not valid JSON'); }
  }
  const xml = await get(FEED_XML, 'XML feed');
  if (xml) {
    const x = parseXml(xml);
    if (x.length) { console.log('Source: XML feed (backup)'); return x; }
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
