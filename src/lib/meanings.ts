import type { Principal } from './opele';
import type { OduRecord, SectionHit } from './corpus';
import { extractSections } from './corpus';
import type { OduThrow } from './opele';
import { translateToEnglish } from './translate';

/** Short traditional character notes for the 16 principals (study aid). */
export const PRINCIPAL_MEANINGS: Record<
  Principal,
  { title: string; essence: string }
> = {
  Ejiogbe: {
    title: 'The supporter / the beginning',
    essence:
      'Openings, speech, leadership, and the principle of things. Speaks of clear paths and aligning the head with the body.',
  },
  Oyeku: {
    title: 'Mother of death / the closing',
    essence:
      'Transformation, stillness, and what is hidden. Asks respect for the dead, caution, and not forcing what is not yet ripe.',
  },
  Iwori: {
    title: 'The deep seer',
    essence:
      'Intuition, investigation, and seeing behind appearances. Warns against haste and gossip; favors careful observation.',
  },
  Idi: {
    title: 'The seal / closing the circle',
    essence:
      'Conclusions, fertility of a matter, and fixing what was started. Speaks of consolidating agreements and protecting your foundation.',
  },
  Irosun: {
    title: 'The one who resonates / blood and root',
    essence:
      'Lineage, memory, and what “sounds” in the blood. Asks honor for elders and not forgetting promises made.',
  },
  Owonrin: {
    title: 'The inverted head / change',
    essence:
      'Reversed plans, moves, and surprises. What looks upside-down can settle if you accept the turn.',
  },
  Obara: {
    title: 'The one who floats / uncertain prosperity',
    essence:
      'Apparent wealth, sweet words, and risk of deceit. Demands honesty in dealings; do not trust appearances alone.',
  },
  Okanran: {
    title: 'The beater / confrontation',
    essence:
      'Clashes, strong temper, and justice. Warns not to raise a hand or get tangled in lawsuits; channel the force.',
  },
  Ogunda: {
    title: 'The creator / iron',
    essence:
      'Work, Oggún, cutting and building. Favors concrete effort; watch for accidents and tools.',
  },
  Osa: {
    title: 'The spirit of Sa / the wind',
    essence:
      'Swift movement, Oyá, and sudden change. Asks flexibility; do not cling to what the wind already carries away.',
  },
  Ika: {
    title: 'The controller / the circle',
    essence:
      'Boundaries, poison and cure. Speaks of controlling the tongue and excess; what harms can also heal in measure.',
  },
  Oturupon: {
    title: 'The bearer / the burden',
    essence:
      'Weight, illness, and responsibility. Invites you to lighten loads, care for health, and not carry what is not yours.',
  },
  Otura: {
    title: 'The comforter / the good word',
    essence:
      'Consolation, teaching, and religious paths. Favors studying, teaching, and speaking soft truth.',
  },
  Irete: {
    title: 'The crusher / perseverance',
    essence:
      'Pressure, competition, and going far through constancy. Beware pride as you rise.',
  },
  Ose: {
    title: 'The conqueror / Ochún’s victory',
    essence:
      'Sweetness, attraction, and triumph through affection. Linked to Ochún; asks diplomacy, not brute force.',
  },
  Oragun: {
    title: 'The giver / Ofún, fullness',
    essence:
      'White wisdom, purity, and giving/receiving. Speaks of Obatalá, mental clarity, and not staining the sacred.',
  },
};

export interface ReadingDescription {
  headline: string;
  summary: string;
  ifaSays: string;
  proverb: string;
  rightMeaning: string;
  leftMeaning: string;
  combinationNote: string;
  translating?: boolean;
}

function firstParagraph(sectionBody: string, max = 420): string {
  const cleaned = sectionBody
    .replace(/^.*?(refranes|nace|ewebe|if[aá]\s*dice|proverb).*$/gim, '')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter((p) => p.length > 20);
  const joined = (parts.slice(0, 3).join(' ') || cleaned).trim();
  if (joined.length <= max) return joined;
  return joined.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

function sectionByTitle(sections: SectionHit[], re: RegExp): string {
  const hit = sections.find((s) => re.test(s.title));
  return hit ? firstParagraph(hit.body) : '';
}

export function describeReading(
  th: OduThrow,
  record?: OduRecord
): ReadingDescription {
  const right = PRINCIPAL_MEANINGS[th.primary];
  const left = PRINCIPAL_MEANINGS[th.secondary];
  const sections = extractSections(record?.text || '');

  const ifaSaysEs =
    sectionByTitle(sections, /if[aá]/i) ||
    (record?.text
      ? firstParagraph(record.text.replace(/^[\s\S]{0,80}?W[oó].*?dice/i, ''), 380)
      : '');

  const proverbEs = sectionByTitle(sections, /refr|proverb/i) || '';

  const combinationNote = th.isMeji
    ? `${th.primary} Meji doubles its own energy: the message arrives complete and unmixed. It is a major odù (Ojú Odù).`
    : `The right leg (${th.primary}) sets the main tone; the left (${th.secondary}) nuances, corrects, or supports. Together they form the omolúo ${th.displayName}.`;

  const summaryParts = [
    `What was divined is **${th.displayName}**.`,
    right.essence,
    th.isMeji
      ? 'As Meji, that essence is strongly affirmed.'
      : `It combines with the current of ${th.secondary}: ${left.essence}`,
  ];

  return {
    headline: th.displayName,
    summary: summaryParts.join(' '),
    ifaSays:
      ifaSaysEs ||
      'Open the full corpus or cast again when text is available for this odù.',
    proverb: proverbEs || '—',
    rightMeaning: `${right.title}. ${right.essence}`,
    leftMeaning: th.isMeji
      ? `${right.title} (doubled).`
      : `${left.title}. ${left.essence}`,
    combinationNote,
    translating: Boolean(ifaSaysEs || (proverbEs && proverbEs !== '—')),
  };
}

/** Translate corpus-sourced fields (Ifá says / proverb) into English. */
export async function localizeReading(
  reading: ReadingDescription
): Promise<ReadingDescription> {
  const [ifaSays, proverb] = await Promise.all([
    reading.ifaSays && reading.ifaSays !== '—'
      ? translateToEnglish(reading.ifaSays)
      : Promise.resolve(reading.ifaSays),
    reading.proverb && reading.proverb !== '—'
      ? translateToEnglish(reading.proverb)
      : Promise.resolve(reading.proverb),
  ]);
  return { ...reading, ifaSays, proverb, translating: false };
}
