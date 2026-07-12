/**
 * 21-day advice planning via NSGA-II.
 *
 * Genome: one action index per day (21 genes) chosen from a pool distilled
 * from the main odù + omoluó corpus texts.
 *
 * Objectives (all minimized):
 *  1. alignmentGap   — under-coverage of main-odù themes
 *  2. cautionGap     — under-coverage of warnings / cares
 *  3. monotony       — repetitive day-to-day focus (1 - diversity)
 *  4. pacingStrain   — consecutive high-intensity days without rest
 */

import type { OduRecord } from './corpus';
import type { OduThrow } from './opele';
import { pickKneePoint, runNsga2, type Individual } from './nsga2';

export type ActionKind = 'practice' | 'caution' | 'relation' | 'rest' | 'study';

export interface AdviceAction {
  id: string;
  kind: ActionKind;
  label: string;
  detail: string;
  /** Themes / keywords this action covers */
  tags: string[];
  intensity: 1 | 2 | 3; // 1 = gentle/rest, 3 = demanding
  sourceOdu: string;
}

export interface DayAdvice {
  day: number; // 1–21
  dateISO: string;
  action: AdviceAction;
}

export interface Plan21Result {
  days: DayAdvice[];
  objectives: {
    alignmentGap: number;
    cautionGap: number;
    monotony: number;
    pacingStrain: number;
  };
  objectiveNames: string[];
  paretoSize: number;
  populationSize: number;
  generations: number;
  poolSize: number;
  mainOdu: string;
  supportOdus: string[];
  concepts: string[];
  summary: string;
}

const STOP = new Set(
  'el la los las un una unos unas de del al a y o u en que se es son por para con sin sobre entre como mas más muy ya no si sí su sus mi tus le les lo me te nos os fue ser estar hay este esta estos estas aquel aquello todo toda todos todas otro otra otros otras cuando donde dónde porque qué cual cuál cuales cuáles este esta esto ud usted'.split(
    /\s+/
  )
);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function topKeywords(text: string, n = 16): string[] {
  const freq = new Map<string, number>();
  for (const t of tokenize(text)) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w);
}

function sentences(text: string): string[] {
  return text
    .split(/[\n.!?]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 28 && s.length < 220);
}

const CAUTION_RE =
  /\b(cuidado|no\s+|evite|evitar|prohib|tabu|tabú|ewo|peligro|enemigo|muerte|iku|cárcel|carcel|enfermedad|daño|dano|maldic|engaño|engano)\b/i;
const PRACTICE_RE =
  /\b(haga|hacer|ebbo|ebó|ebo|rogacion|rogación|ofrenda|atienda|atender|cumpla|cumplir|despojo|baño|reza|oraci|maferefun|asentar)\b/i;
const RELATION_RE =
  /\b(familia|conyuge|cónyuge|esposa|esposo|madre|padre|amigo|hogar|casa|respeto|mayor|sangre)\b/i;

function classifyLine(line: string): ActionKind {
  if (CAUTION_RE.test(line)) return 'caution';
  if (RELATION_RE.test(line)) return 'relation';
  if (PRACTICE_RE.test(line)) return 'practice';
  return 'study';
}

function slug(s: string, i: number): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) + `-${i}`
  );
}

/** Build an action pool from corpus records (main first). */
export function buildActionPool(
  records: { throw: OduThrow; record?: OduRecord }[]
): AdviceAction[] {
  const pool: AdviceAction[] = [];
  let idx = 0;

  for (const { throw: th, record } of records) {
    const text = record?.text || '';
    if (!text.trim()) continue;
    const keys = topKeywords(text, 10);
    const lines = sentences(text);

    // Prefer caution / practice lines
    const ranked = [...lines].sort((a, b) => {
      const sa =
        (CAUTION_RE.test(a) ? 3 : 0) +
        (PRACTICE_RE.test(a) ? 2 : 0) +
        (RELATION_RE.test(a) ? 1 : 0);
      const sb =
        (CAUTION_RE.test(b) ? 3 : 0) +
        (PRACTICE_RE.test(b) ? 2 : 0) +
        (RELATION_RE.test(b) ? 1 : 0);
      return sb - sa;
    });

    for (const line of ranked.slice(0, 14)) {
      const kind = classifyLine(line);
      const intensity: 1 | 2 | 3 =
        kind === 'caution' ? 2 : kind === 'practice' ? 3 : kind === 'relation' ? 2 : 1;
      pool.push({
        id: slug(`${th.id}-${kind}`, idx++),
        kind,
        label: shortLabel(line, kind),
        detail: line,
        tags: [...new Set([...tokenize(line).slice(0, 6), ...keys.slice(0, 4)])],
        intensity,
        sourceOdu: th.displayName,
      });
    }
  }

  // Always include rest / pacing anchors
  const rests: AdviceAction[] = [
    {
      id: 'rest-silence',
      kind: 'rest',
      label: 'Día de silencio y escucha',
      detail:
        'Baje el ritmo: menos discusión, más observación. Deje que la cabeza se una al cuerpo.',
      tags: ['calma', 'paciencia', 'silencio', 'equilibrio'],
      intensity: 1,
      sourceOdu: 'ritmo',
    },
    {
      id: 'rest-gratitude',
      kind: 'rest',
      label: 'Gratitud y orden del hogar',
      detail:
        'Ordene un rincón de su casa, dé gracias a su Ángel de la Guarda y evite enredos ajenos.',
      tags: ['hogar', 'orden', 'angel', 'respeto'],
      intensity: 1,
      sourceOdu: 'ritmo',
    },
    {
      id: 'rest-body',
      kind: 'rest',
      label: 'Cuidado del cuerpo',
      detail:
        'Descanse el estómago y la espalda; hidratación simple, sin excesos ni ropa que atraiga conflicto.',
      tags: ['salud', 'cuerpo', 'descanso', 'higiene'],
      intensity: 1,
      sourceOdu: 'ritmo',
    },
  ];

  for (const r of rests) pool.push(r);

  // Deduplicate by detail prefix
  const seen = new Set<string>();
  const unique: AdviceAction[] = [];
  for (const a of pool) {
    const key = a.detail.slice(0, 60).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(a);
  }
  return unique.slice(0, 64);
}

function shortLabel(line: string, kind: ActionKind): string {
  const prefix =
    kind === 'caution'
      ? 'Cuidado'
      : kind === 'practice'
        ? 'Práctica'
        : kind === 'relation'
          ? 'Vínculo'
          : 'Estudio';
  const clip = line.length > 72 ? line.slice(0, 69).replace(/\s+\S*$/, '') + '…' : line;
  return `${prefix}: ${clip}`;
}

export function extractConcepts(pool: AdviceAction[], limit = 12): string[] {
  const freq = new Map<string, number>();
  for (const a of pool) {
    for (const t of a.tags) freq.set(t, (freq.get(t) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

type Genome = number[]; // indices into pool, length 21

function evaluateGenome(
  genome: Genome,
  pool: AdviceAction[],
  mainTags: Set<string>,
  cautionNeed: number
): number[] {
  const days = genome.map((gi) => pool[gi % pool.length]);
  const allTags = new Set<string>();
  const cautionDays = days.filter((d) => d.kind === 'caution').length;
  const kindCounts = new Map<ActionKind, number>();
  let strain = 0;
  let streak = 0;

  for (const d of days) {
    for (const t of d.tags) allTags.add(t);
    kindCounts.set(d.kind, (kindCounts.get(d.kind) || 0) + 1);
    if (d.intensity >= 3) {
      streak++;
      if (streak >= 3) strain += 1;
    } else {
      streak = 0;
    }
  }

  // 1) alignmentGap: fraction of main tags not covered
  let hit = 0;
  for (const t of mainTags) if (allTags.has(t)) hit++;
  const alignmentGap = mainTags.size ? 1 - hit / mainTags.size : 0.5;

  // 2) cautionGap: want ~ cautionNeed caution days (target ~5 of 21)
  const targetCaution = Math.max(3, Math.min(7, cautionNeed));
  const cautionGap = Math.abs(cautionDays - targetCaution) / 21;

  // 3) monotony: Shannon entropy inverse over kinds
  let entropy = 0;
  for (const c of kindCounts.values()) {
    const p = c / 21;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  const maxEnt = Math.log2(5);
  const monotony = 1 - entropy / (maxEnt || 1);

  // 4) pacingStrain normalized
  const pacingStrain = Math.min(1, strain / 8);

  return [alignmentGap, cautionGap, monotony, pacingStrain];
}

function addDays(start: Date, n: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + n);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface EvolveOptions {
  populationSize?: number;
  generations?: number;
  startDate?: Date;
}

/**
 * Evolve a 21-day plan from odù corpus texts using NSGA-II.
 */
export function evolve21DayPlan(
  main: OduThrow,
  supports: OduThrow[],
  records: { throw: OduThrow; record?: OduRecord }[],
  opts: EvolveOptions = {}
): Plan21Result {
  const populationSize = opts.populationSize ?? 48;
  const generations = opts.generations ?? 40;
  const startDate = opts.startDate ?? new Date();

  const pool = buildActionPool(records);
  if (pool.length < 4) {
    // Minimal fallback so UI never crashes
    const fallback: AdviceAction = {
      id: 'fallback-study',
      kind: 'study',
      label: 'Estudiar el odù principal',
      detail: `Lea con calma el texto de ${main.displayName} y anote lo que le resuene.`,
      tags: ['estudio', 'odu', 'paciencia'],
      intensity: 1,
      sourceOdu: main.displayName,
    };
    pool.push(fallback);
  }

  const mainRec = records[0]?.record;
  const mainTags = new Set(topKeywords(mainRec?.text || '', 14));
  const cautionLines = (mainRec?.text || '').split('\n').filter((l) => CAUTION_RE.test(l));
  const cautionNeed = Math.min(7, Math.max(3, Math.ceil(cautionLines.length / 8)));

  const DAYS = 21;
  const rnd = Math.random;

  const result = runNsga2<Genome>({
    populationSize,
    generations,
    crossoverRate: 0.9,
    mutationRate: 0.12,
    objectiveCount: 4,
    create: () => Array.from({ length: DAYS }, () => Math.floor(rnd() * pool.length)),
    evaluate: (g) => evaluateGenome(g, pool, mainTags, cautionNeed),
    crossover: (a, b) => {
      const point = 1 + Math.floor(rnd() * (DAYS - 2));
      return [
        [...a.slice(0, point), ...b.slice(point)],
        [...b.slice(0, point), ...a.slice(point)],
      ];
    },
    mutate: (g, rate) =>
      g.map((gene) => (rnd() < rate ? Math.floor(rnd() * pool.length) : gene)),
  });

  const chosen =
    pickKneePoint(result.paretoFront) ||
    result.population[0] ||
    ({
      genome: Array(DAYS).fill(0),
      objectives: [1, 1, 1, 1],
      rank: 0,
      crowdingDistance: 0,
    } as Individual<Genome>);

  const [alignmentGap, cautionGap, monotony, pacingStrain] = chosen.objectives;
  const concepts = extractConcepts(pool);

  const days: DayAdvice[] = chosen.genome.map((gi, i) => ({
    day: i + 1,
    dateISO: toISODate(addDays(startDate, i)),
    action: pool[gi % pool.length],
  }));

  const summary = buildSummary(main, supports, concepts, chosen.objectives, result.paretoFront.length);

  return {
    days,
    objectives: { alignmentGap, cautionGap, monotony, pacingStrain },
    objectiveNames: [
      'Brecha de alineación con el odù',
      'Brecha de cuidados / advertencias',
      'Monotonía (falta de variedad)',
      'Tensión de ritmo (días intensos seguidos)',
    ],
    paretoSize: result.paretoFront.length,
    populationSize,
    generations,
    poolSize: pool.length,
    mainOdu: main.displayName,
    supportOdus: supports.map((s) => s.displayName),
    concepts,
    summary,
  };
}

function buildSummary(
  main: OduThrow,
  supports: OduThrow[],
  concepts: string[],
  obj: number[],
  paretoSize: number
): string {
  const supportsTxt = supports.length
    ? supports.map((s) => s.displayName).join(', ')
    : 'sin omoluós adicionales';
  return [
    `Plan de 21 días evolucionado con NSGA-II a partir de **${main.displayName}**`,
    `(apoyos: ${supportsTxt}).`,
    `Conceptos dominantes del corpus: ${concepts.slice(0, 8).join(', ') || '—'}.`,
    `Frente de Pareto: ${paretoSize} planes no dominados; se eligió el punto de compromiso (rodilla) que equilibra alineación, cuidados, variedad y ritmo sostenible.`,
    `Scores (menor = mejor): alineación ${(obj[0] * 100).toFixed(0)}%, cuidados ${(obj[1] * 100).toFixed(0)}%, monotonía ${(obj[2] * 100).toFixed(0)}%, tensión ${(obj[3] * 100).toFixed(0)}%.`,
    `Esto es orientación educativa basada en el texto de orula.org — no sustituye a un babalawo.`,
  ].join(' ');
}

export function formatPlanMarkdown(plan: Plan21Result): string {
  const lines: string[] = [];
  lines.push('## Plan de 21 días (NSGA-II)');
  lines.push('');
  lines.push(plan.summary);
  lines.push('');
  lines.push('### Conceptos triangulados');
  lines.push(plan.concepts.map((c) => `• ${c}`).join('\n') || '• —');
  lines.push('');
  lines.push('### Calendario');
  for (const d of plan.days) {
    lines.push(
      `**Día ${d.day}** (${d.dateISO}) — _${d.action.kind}_ · ${d.action.label}\n${d.action.detail} _(fuente: ${d.action.sourceOdu})_`
    );
    lines.push('');
  }
  return lines.join('\n');
}
