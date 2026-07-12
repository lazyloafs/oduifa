/**
 * Scrape all 256 odù pages from orula.org into data/odus.json
 * Resume-capable: skips entries that already have non-empty text.
 *
 * URL pattern:
 *   http://www.orula.org/orula/{Primary}Wiki.nsf/Pages/{Primary}-{Secondary}
 * Meji pages use Secondary = "Meji"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'odus.json');
const PROGRESS = path.join(ROOT, 'data', 'scrape-progress.json');

/** 16 principal names matching orula.org wiki roots */
export const PRINCIPALS = [
  'Ejiogbe',
  'Oyeku',
  'Iwori',
  'Idi',
  'Irosun',
  'Owonrin',
  'Obara',
  'Okanran',
  'Ogunda',
  'Osa',
  'Ika',
  'Oturupon',
  'Otura',
  'Irete',
  'Ose',
  'Oragun',
];

const DELAY_MS = 300;
const USER_AGENT =
  'OpweleCorpusBot/1.0 (+local research; respectful rate limit; contact: local desktop app)';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pageUrl(primary, secondary) {
  const sec = primary === secondary ? 'Meji' : secondary;
  return `http://www.orula.org/orula/${primary}Wiki.nsf/Pages/${primary}-${sec}`;
}

function oduId(primary, secondary) {
  const sec = primary === secondary ? 'Meji' : secondary;
  return `${primary}-${sec}`;
}

function oduName(primary, secondary) {
  if (primary === secondary) return `${primary} Meji`;
  return `${primary}-${secondary}`;
}

function loadExisting() {
  if (!fs.existsSync(OUT)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function extractText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();

  const $root = $('#wiki-content').length
    ? $('#wiki-content')
    : $('#content').length
      ? $('#content')
      : $('body');

  // Normalize <br> to newlines before text extraction
  $root.find('br').replaceWith('\n');

  const parts = [];

  // Leading text nodes before first element
  $root.contents().each((_, node) => {
    if (node.type === 'text') {
      const t = $(node).text().replace(/\s+/g, ' ').trim();
      if (t.length > 3) parts.push(t);
    }
  });

  $root.find('h1, h2, h3, h4, h5, li, p, blockquote').each((_, el) => {
    const tag = (el.tagName || el.name || '').toLowerCase();
    let text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 2) return;
    if (/DominoWiki is/i.test(text)) return;
    if (tag.startsWith('h')) {
      parts.push(`\n## ${text}\n`);
    } else if (tag === 'li') {
      parts.push(`• ${text}`);
    } else {
      parts.push(text);
    }
  });

  // Also capture remaining text that may sit outside those tags (DominoWiki often dumps prose after headings)
  const full = $root.text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

  let text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  // If structured extract is too short, fall back to full wiki-content text with light cleanup
  if (text.length < 120 && full.length > text.length) {
    text = full;
  }

  // Prefer union: if full is much longer, append unique trailing prose
  if (full.length > text.length + 200) {
    // Use full text as primary — it includes "Ifá dice" paragraphs that may lack <p> wrappers
    text = full
      .replace(/DominoWiki is heavily reliant[\s\S]*?Thanks\./gi, '')
      .trim();
    // Re-insert heading markers from structured parse when possible
    const headed = parts.filter((p) => p.startsWith('\n## ')).map((p) => p.trim());
    if (headed.length) {
      // Keep full text but it's already good enough
    }
  }

  // Final cleanup of chrome phrases
  text = text
    .replace(/Orula\.org/gi, '')
    .replace(/DominoWiki is[\s\S]*?Thanks\./gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Better: rebuild from HTML with br→newline and block separators
  const $clone = cheerio.load(html);
  $clone('script, style, noscript, iframe, #menu-container, #navmenu, #wiki-footer, #logo').remove();
  const $wc = $clone('#wiki-content');
  if ($wc.length) {
    $wc.find('br').replaceWith('\n');
    $wc.find('h1,h2,h3,h4,h5').each((_, el) => {
      const t = $clone(el).text().trim();
      $clone(el).replaceWith(`\n\n## ${t}\n\n`);
    });
    $wc.find('li').each((_, el) => {
      const t = $clone(el).text().trim();
      $clone(el).replaceWith(`\n• ${t}`);
    });
    $wc.find('p').each((_, el) => {
      const t = $clone(el).text().trim();
      $clone(el).replaceWith(`\n${t}\n`);
    });
    text = $wc
      .text()
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/DominoWiki is[\s\S]*?Thanks\./gi, '')
      .trim();
  }

  return text;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  const html = await res.text();
  return { status: res.status, html, finalUrl: res.url };
}

function buildTargets() {
  const list = [];
  for (const primary of PRINCIPALS) {
    for (const secondary of PRINCIPALS) {
      const id = oduId(primary, secondary);
      list.push({
        id,
        name: oduName(primary, secondary),
        primary,
        secondary,
        isMeji: primary === secondary,
        sourceUrl: pageUrl(primary, secondary),
      });
    }
  }
  return list;
}

async function main() {
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const targets = buildTargets();
  const existing = loadExisting();
  const byId = new Map(existing.map((o) => [o.id, o]));

  let ok = 0;
  let fail = 0;
  let skip = 0;
  const errors = [];

  console.log(`Targets: ${targets.length}`);
  console.log(`Existing corpus: ${existing.length}`);
  console.log(`Output: ${OUT}`);

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const prev = byId.get(t.id);
    if (prev && prev.text && String(prev.text).trim().length > 40 && !prev.scrapeError) {
      skip++;
      process.stdout.write(`[${i + 1}/256] SKIP ${t.id}\n`);
      continue;
    }

    process.stdout.write(`[${i + 1}/256] GET ${t.id} ... `);
    try {
      const { status, html } = await fetchPage(t.sourceUrl);
      if (status >= 400) {
        fail++;
        const entry = {
          ...t,
          text: prev?.text || '',
          scrapedAt: new Date().toISOString(),
          scrapeError: `HTTP ${status}`,
        };
        byId.set(t.id, entry);
        errors.push({ id: t.id, error: `HTTP ${status}` });
        console.log(`FAIL ${status}`);
      } else {
        const text = extractText(html);
        if (!text || text.length < 40) {
          fail++;
          const entry = {
            ...t,
            text: text || '',
            scrapedAt: new Date().toISOString(),
            scrapeError: 'EMPTY_OR_SHORT',
          };
          byId.set(t.id, entry);
          errors.push({ id: t.id, error: 'EMPTY_OR_SHORT' });
          console.log(`EMPTY (${(text || '').length} chars)`);
        } else {
          ok++;
          const entry = {
            ...t,
            text,
            scrapedAt: new Date().toISOString(),
          };
          delete entry.scrapeError;
          byId.set(t.id, entry);
          console.log(`OK ${text.length} chars`);
        }
      }
    } catch (err) {
      fail++;
      const msg = String(err && err.message ? err.message : err);
      byId.set(t.id, {
        ...t,
        text: prev?.text || '',
        scrapedAt: new Date().toISOString(),
        scrapeError: msg,
      });
      errors.push({ id: t.id, error: msg });
      console.log(`ERR ${msg}`);
    }

    const arr = targets.map((x) => byId.get(x.id) || { ...x, text: '', scrapedAt: null });
    fs.writeFileSync(OUT, JSON.stringify(arr, null, 2), 'utf8');
    fs.writeFileSync(
      PROGRESS,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          ok,
          fail,
          skip,
          done: i + 1,
          total: 256,
          errors: errors.slice(-20),
        },
        null,
        2
      ),
      'utf8'
    );

    await sleep(DELAY_MS);
  }

  const final = targets.map((x) => byId.get(x.id)).filter(Boolean);
  const withText = final.filter((o) => o.text && o.text.trim().length > 40).length;
  console.log('\n=== DONE ===');
  console.log(`Scraped OK this run: ${ok}`);
  console.log(`Skipped (resume): ${skip}`);
  console.log(`Failed: ${fail}`);
  console.log(`Corpus with usable text: ${withText}/${final.length}`);
  console.log(`Saved: ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
