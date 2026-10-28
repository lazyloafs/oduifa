/**
 * Public-domain library: verbatim passages from 19th/early-20th-century books, retrieved by how
 * the opelé landed (right leg, left leg, Meji, supports) and cited by source.
 *
 * Built by scripts/build-library.mjs from archive.org OCR text. These are historical accounts by
 * outside observers — they add method and a few odù-specific notes, not a full per-odù verse
 * corpus (that stays orula.org in data/odus.json).
 */
import type { OduThrow } from './opele';
import raw from '../../data/library/public-domain.json' with { type: 'json' };

export type PassageRole =
  | 'method'
  | 'opele'
  | 'health'
  | 'principal'
  | 'verse'
  | 'combination';

export interface LibrarySource {
  id: string;
  short: string;
  author: string;
  title: string;
  year: number;
  archiveId: string;
  url: string;
  license: string;
}

export interface LibraryPassage {
  id: string;
  source: string;
  locator: string;
  role: PassageRole;
  /** Passages on the same point from different sources "agree" with each other. */
  point?: string;
  /** filter: show only if Jev says it bears on the question; annotate: show, label with Jev's view. */
  jev?: 'filter' | 'annotate';
  applies?: { odus?: string[]; meji?: boolean; nonMeji?: boolean };
  convention?: 'left-first';
  note?: string;
  text: string;
  ocr: string;
}

export interface Hit {
  passage: LibraryPassage;
  source: LibrarySource;
  /** Why this passage is here, in terms of how the cast landed. */
  why: string;
  /** Other sources making the same point. */
  agreeing: LibrarySource[];
}

export interface LibraryResult {
  cast: Hit[];
  method: Hit[];
  /** Set when the cast is a mixed pair and a source names pairs in the opposite order. */
  conventionNote: string | null;
  /** Hits that carry a Jev flag (filter / annotate). */
  jevCandidates: Hit[];
}

const LIB = raw as unknown as {
  about: string;
  sources: LibrarySource[];
  passages: LibraryPassage[];
};
export const LIBRARY_ABOUT = LIB.about;
export const LIBRARY_SOURCES = LIB.sources;

const sourceById = new Map(LIB.sources.map((s) => [s.id, s]));

function legRoles(th: OduThrow, odu: string): string | null {
  const right = th.primary === odu;
  const left = th.secondary === odu;
  if (right && left) return `${odu} fell on both legs (${th.displayName})`;
  if (right) return `${odu} is your right (primary) leg`;
  if (left) return `${odu} is your left leg`;
  return null;
}

function whyFor(
  p: LibraryPassage,
  main: OduThrow,
  supports: OduThrow[]
): string | null {
  const a = p.applies;
  if (!a) return 'How the oracle is read';
  if (a.meji) return main.isMeji ? `${main.displayName} is a Meji — a doubled odù` : null;
  if (a.nonMeji) {
    return main.isMeji
      ? null
      : `Your cast pairs ${main.primary} (right) with ${main.secondary} (left)`;
  }
  if (a.odus) {
    for (const odu of a.odus) {
      const m = legRoles(main, odu);
      if (m) return m;
      for (let i = 0; i < supports.length; i++) {
        const sup = supports[i];
        if (sup.primary === odu || sup.secondary === odu) {
          return `${odu} appears in support ${i + 1} (${sup.displayName})`;
        }
      }
    }
  }
  return null;
}

export function retrieve(main: OduThrow, supports: OduThrow[]): LibraryResult {
  const byPoint = new Map<string, LibraryPassage[]>();
  for (const p of LIB.passages) {
    if (!p.point) continue;
    byPoint.set(p.point, [...(byPoint.get(p.point) || []), p]);
  }

  const cast: Hit[] = [];
  const method: Hit[] = [];
  for (const p of LIB.passages) {
    const why = whyFor(p, main, supports);
    if (!why) continue;
    const source = sourceById.get(p.source);
    if (!source) continue;
    const agreeing = (byPoint.get(p.point || '') || [])
      .filter((q) => q.id !== p.id && q.source !== p.source)
      .map((q) => sourceById.get(q.source))
      .filter((s): s is LibrarySource => Boolean(s));
    const hit: Hit = { passage: p, source, why, agreeing };
    (p.applies ? cast : method).push(hit);
  }

  const conventionNote =
    !main.isMeji && cast.some((h) => h.passage.convention === 'left-first')
      ? `This source names a pair starting from the left-hand odù. This app follows the Cuban Lucumí convention (as on orula.org) and reads the right leg first, so your cast is read as ${main.primary}–${main.secondary}; named in the source’s order the same throw would be ${main.secondary}–${main.primary}. The two conventions are different traditions, not a mistake in either.`
      : null;

  const all = [...cast, ...method];
  return {
    cast,
    method,
    conventionNote,
    jevCandidates: all.filter((h) => h.passage.jev),
  };
}
