import type { OduRecord } from './corpus';
import type { OduThrow } from './opele';
import { translateToEnglish, translateMany } from './translate';

const STOP = new Set(
  'el la los las un una unos unas de del al a y o u en que se es son por para con sin sobre entre como mas más muy ya no si sí su sus mi tus le les lo me te nos os fue ser estar hay este esta estos estas aquel aquello todo toda todos todas otro otra otros otras cuando donde dónde porque porqué porque qué cual cuál cuales cuáles del the and for with that this from'.split(
    /\s+/
  )
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function topKeywords(text: string, n = 12): string[] {
  const freq = new Map<string, number>();
  for (const t of tokens(text)) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function snippet(text: string, max = 900): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function sharedThemes(texts: string[]): string[] {
  if (texts.length < 2) return topKeywords(texts[0] || '', 8);
  const sets = texts.map((t) => new Set(topKeywords(t, 40)));
  const scores = new Map<string, number>();
  for (const s of sets) {
    for (const w of s) scores.set(w, (scores.get(w) || 0) + 1);
  }
  return [...scores.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([w]) => w);
}

export function buildTriangulationPrompt(
  main: OduThrow,
  supports: OduThrow[],
  records: { throw: OduThrow; record?: OduRecord }[]
): string {
  const blocks = records
    .map(({ throw: th, record }, i) => {
      const role = i === 0 ? 'MAIN ODÙ' : `OMOLÚO / SUPPORT ${i}`;
      const body = record?.text
        ? snippet(record.text, 1400)
        : '(No text in local corpus)';
      return `### ${role}: ${th.displayName} (${th.id})\nSource: ${th.sourceUrl}\n${body}`;
    })
    .join('\n\n');

  return `Triangulate an Ifá reading from the main odù and support signs (omolúos).

Main odù: ${main.displayName}
Supports: ${supports.map((s) => s.displayName).join(', ') || '(none)'}

Use ONLY the corpus content below. The corpus is in Spanish — translate and respond entirely in clear English.
Structure your answer as:
1) General synthesis
2) Themes reinforced between main and supports
3) Warnings / cautions (if present)
4) Key proverbs or phrases (translated)
5) Humility note: educational guidance only; does not replace a babalawo.

CORPUS:
${blocks}`;
}

export function localTriangulate(
  main: OduThrow,
  supports: OduThrow[],
  records: { throw: OduThrow; record?: OduRecord }[]
): string {
  const mainRec = records[0]?.record;
  const supportRecs = records
    .slice(1)
    .map((r) => r.record)
    .filter(Boolean) as OduRecord[];
  const allTexts = [mainRec, ...supportRecs]
    .map((r) => r?.text || '')
    .filter(Boolean);
  const themes = sharedThemes(allTexts);
  const mainKeys = topKeywords(mainRec?.text || '', 10);

  const lines: string[] = [];
  lines.push('## Local synthesis (translating corpus themes)');
  lines.push('');
  lines.push(
    `Reading centered on **${main.displayName}**, refined by ${
      supports.length
        ? supports.map((s) => s.displayName).join(', ')
        : 'no additional omolúo'
    }.`
  );
  lines.push('');
  lines.push('### Crossing themes (from Spanish corpus keywords)');
  if (themes.length) {
    lines.push(themes.map((t) => `• ${t}`).join('\n'));
  } else {
    lines.push('• (Few clear lexical overlaps; see full texts.)');
  }
  lines.push('');
  lines.push('### Emphasis of the main odù');
  lines.push(
    mainKeys.length
      ? mainKeys.map((t) => `• ${t}`).join('\n')
      : '• Empty corpus for this odù.'
  );
  lines.push('');
  lines.push('### Merged narrative (source language — translate below if needed)');
  if (mainRec?.text) {
    lines.push(snippet(mainRec.text, 700));
  } else {
    lines.push('_No local main text. Run `npm run scrape`._');
  }
  for (let i = 0; i < supports.length; i++) {
    const rec = supportRecs[i];
    lines.push('');
    lines.push(`### Support: ${supports[i].displayName}`);
    lines.push(rec?.text ? snippet(rec.text, 480) : '_No corpus text._');
  }
  lines.push('');
  lines.push('### Note');
  lines.push(
    'This synthesis is automatic. It does not replace consultation with a babalawo. With OPENAI_API_KEY you get a fuller English triangulation.'
  );
  return lines.join('\n');
}

/** Translate local triangulation narrative blocks to English. */
export async function localizeTriangulation(text: string): Promise<string> {
  // Translate substantial non-heading paragraphs
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (
      !line.trim() ||
      line.startsWith('#') ||
      line.startsWith('•') ||
      line.startsWith('_') ||
      line.length < 40
    ) {
      out.push(line);
      continue;
    }
    out.push(await translateToEnglish(line));
  }
  return out.join('\n');
}

export async function localizeTriangulationSnippets(
  text: string
): Promise<string> {
  const chunks = text
    .split(/\n\n+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const translated = await translateMany(chunks);
  return translated.join('\n\n');
}
