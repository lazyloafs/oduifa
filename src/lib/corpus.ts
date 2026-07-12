export interface OduRecord {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  isMeji: boolean;
  sourceUrl: string;
  text: string;
  scrapedAt?: string | null;
  scrapeError?: string;
}

export interface SectionHit {
  title: string;
  body: string;
}

const SECTION_PATTERNS: { key: string; re: RegExp }[] = [
  { key: 'Refranes', re: /refr[aá]n/i },
  { key: 'Nace', re: /\bnace\b/i },
  { key: 'Ewebe', re: /ewebe|ewe\b|hierba/i },
  { key: 'Ifá dice', re: /if[aá]\s*dice|dice\s+if[aá]/i },
  { key: 'Proverbio', re: /proverb/i },
  { key: 'Ebó', re: /\beb[oó]\b|ebo\b|sacrific/i },
  { key: 'Tabú', re: /tab[uú]|ew[oó]\b/i },
];

export function findOdu(corpus: OduRecord[], id: string): OduRecord | undefined {
  return corpus.find((o) => o.id === id);
}

export function extractSections(text: string): SectionHit[] {
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const hits: SectionHit[] = [];
  let current: SectionHit | null = null;

  for (const line of lines) {
    const matched = SECTION_PATTERNS.find((p) => p.re.test(line) && line.length < 80);
    if (matched) {
      if (current && current.body.trim()) hits.push(current);
      current = { title: matched.key, body: line + '\n' };
    } else if (current) {
      current.body += line + '\n';
    }
  }
  if (current && current.body.trim()) hits.push(current);

  // Also keyword-window fallback if no headings found
  if (hits.length === 0) {
    for (const p of SECTION_PATTERNS) {
      const idx = text.search(p.re);
      if (idx >= 0) {
        hits.push({
          title: p.key,
          body: text.slice(Math.max(0, idx - 40), Math.min(text.length, idx + 420)).trim(),
        });
      }
    }
  }
  return hits.slice(0, 8);
}

export function corpusStats(corpus: OduRecord[]) {
  const total = corpus.length;
  const withText = corpus.filter((o) => o.text && o.text.trim().length > 40).length;
  return { total, withText };
}
