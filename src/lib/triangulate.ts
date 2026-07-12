import type { OduRecord } from './corpus';
import type { OduThrow } from './opele';

const STOP = new Set(
  'el la los las un una unos unas de del al a y o u en que se es son por para con sin sobre entre como mas más muy ya no si sí su sus mi tus le les lo me te nos os fue ser estar hay este esta estos estas aquel aquello todo toda todos todas otro otra otros otras cuando donde dónde porque porqué porque qué cual cuál cuales cuáles del'.split(
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
      const role = i === 0 ? 'ODÙ PRINCIPAL' : `OMOLUÓ / APOYO ${i}`;
      const body = record?.text ? snippet(record.text, 1400) : '(Sin texto en corpus local)';
      return `### ${role}: ${th.displayName} (${th.id})\nFuente: ${th.sourceUrl}\n${body}`;
    })
    .join('\n\n');

  return `Triangula una lectura de Ifá a partir del odù principal y los signos de apoyo (omoluós).

Odù principal: ${main.displayName}
Apoyos: ${supports.map((s) => s.displayName).join(', ') || '(ninguno)'}

Usa SOLO el contenido del corpus siguiente. Estructura tu respuesta así:
1) Síntesis general
2) Temas que se refuerzan entre principal y apoyos
3) Advertencias / cuidados (si aparecen en los textos)
4) Refranes o frases clave (si hay)
5) Nota de humildad: esto es orientación educativa, no sustituye a un babalawo.

CORPUS:
${blocks}`;
}

export function localTriangulate(
  main: OduThrow,
  supports: OduThrow[],
  records: { throw: OduThrow; record?: OduRecord }[]
): string {
  const mainRec = records[0]?.record;
  const supportRecs = records.slice(1).map((r) => r.record).filter(Boolean) as OduRecord[];
  const allTexts = [mainRec, ...supportRecs].map((r) => r?.text || '').filter(Boolean);
  const themes = sharedThemes(allTexts);
  const mainKeys = topKeywords(mainRec?.text || '', 10);

  const lines: string[] = [];
  lines.push('## Síntesis local (sin OpenAI)');
  lines.push('');
  lines.push(
    `Lectura centrada en **${main.displayName}**, refinada por ${
      supports.length
        ? supports.map((s) => s.displayName).join(', ')
        : 'ningún omoluó adicional'
    }.`
  );
  lines.push('');
  lines.push('### Temas que se cruzan');
  if (themes.length) {
    lines.push(themes.map((t) => `• ${t}`).join('\n'));
  } else {
    lines.push('• (Pocos solapamientos léxicos claros; revise los textos completos abajo.)');
  }
  lines.push('');
  lines.push('### Énfasis del odù principal');
  lines.push(mainKeys.length ? mainKeys.map((t) => `• ${t}`).join('\n') : '• Corpus vacío para este odù.');
  lines.push('');
  lines.push('### Narrativa fusionada');
  if (mainRec?.text) {
    lines.push(snippet(mainRec.text, 700));
  } else {
    lines.push('_No hay texto local del principal. Ejecute `npm run scrape`._');
  }
  for (let i = 0; i < supports.length; i++) {
    const rec = supportRecs[i];
    lines.push('');
    lines.push(`### Apoyo: ${supports[i].displayName}`);
    lines.push(rec?.text ? snippet(rec.text, 480) : '_Sin texto en corpus._');
  }
  lines.push('');
  lines.push('### Nota');
  lines.push(
    'Esta síntesis es automática (extracción de temas + fusión de fragmentos del corpus de orula.org). No reemplaza la consulta con un babalawo. Con `OPENAI_API_KEY` se puede obtener una triangulación narrativa más elaborada.'
  );
  return lines.join('\n');
}
