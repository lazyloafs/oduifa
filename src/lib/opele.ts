/**
 * Opele binary mapping (Cuban / Lucumí traditional mark patterns)
 *
 * Each shell: I (open / concave / odd) = 1, II (closed / convex / even) = 0
 * Four shells top→bottom form bits [MSB..LSB] → value 0–15.
 *
 * Mark patterns (I=open, II=closed) are the standard single-leg figures:
 *   Ejiogbe  I I I I     Oyeku   II II II II
 *   Iwori    I II I II   Idi     II I II I
 *   Irosun   I I II II   Owonrin II II I I
 *   Obara    I II II II  Okanran II I I I
 *   Ogunda   I I I II    Osa     II II II I
 *   Ika      I II I I    Oturupon II I II II
 *   Otura    I I II I    Irete   II II I II
 *   Ose      I II II I   Oragun  II I I II
 *
 * Right column (4 shells) = primary (wiki root).
 * Left column (4 shells)  = secondary.
 * Equal legs → Meji (name "Primary-Meji" / "Primary Meji").
 */

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
] as const;

export type Principal = (typeof PRINCIPALS)[number];

/** Index 0–15 by binary value (MSB = top shell). */
export const ODU_BY_BITS: Principal[] = [
  'Oyeku', // 0000
  'Osa', // 0001
  'Irete', // 0010
  'Owonrin', // 0011
  'Oturupon', // 0100
  'Idi', // 0101
  'Oragun', // 0110
  'Okanran', // 0111
  'Obara', // 1000
  'Ose', // 1001
  'Iwori', // 1010
  'Ika', // 1011
  'Irosun', // 1100
  'Otura', // 1101
  'Ogunda', // 1110
  'Ejiogbe', // 1111
];

/** Seniority order 1–16 (reference only). */
export const SENIORITY: Principal[] = [
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

export type Shell = 0 | 1; // 0 = II, 1 = I

export interface Leg {
  shells: [Shell, Shell, Shell, Shell];
  bits: number;
  name: Principal;
  marks: string[]; // 'I' | 'II'
}

export interface OduThrow {
  right: Leg; // primary
  left: Leg; // secondary
  id: string; // e.g. Ejiogbe-Oyeku or Ejiogbe-Meji
  displayName: string;
  isMeji: boolean;
  primary: Principal;
  secondary: Principal;
  sourceUrl: string;
}

export function shellsToBits(shells: [Shell, Shell, Shell, Shell]): number {
  return ((shells[0] << 3) | (shells[1] << 2) | (shells[2] << 1) | shells[3]) & 0xf;
}

export function bitsToLeg(bits: number): Leg {
  const b = bits & 0xf;
  const shells: [Shell, Shell, Shell, Shell] = [
    ((b >> 3) & 1) as Shell,
    ((b >> 2) & 1) as Shell,
    ((b >> 1) & 1) as Shell,
    (b & 1) as Shell,
  ];
  const name = ODU_BY_BITS[b];
  return {
    shells,
    bits: b,
    name,
    marks: shells.map((s) => (s === 1 ? 'I' : 'II')),
  };
}

export function randomShell(): Shell {
  return (Math.random() < 0.5 ? 0 : 1) as Shell;
}

export function randomLeg(): Leg {
  const shells: [Shell, Shell, Shell, Shell] = [
    randomShell(),
    randomShell(),
    randomShell(),
    randomShell(),
  ];
  return bitsToLeg(shellsToBits(shells));
}

export function combineLegs(right: Leg, left: Leg): OduThrow {
  const primary = right.name;
  const secondary = left.name;
  const isMeji = primary === secondary;
  const id = isMeji ? `${primary}-Meji` : `${primary}-${secondary}`;
  const displayName = isMeji ? `${primary} Meji` : `${primary}–${secondary}`;
  const sourceUrl = `http://www.orula.org/orula/${primary}Wiki.nsf/Pages/${id}`;
  return {
    right,
    left,
    id,
    displayName,
    isMeji,
    primary,
    secondary,
    sourceUrl,
  };
}

export function throwOpele(): OduThrow {
  return combineLegs(randomLeg(), randomLeg());
}

export function wikiRoot(primary: Principal): string {
  return `http://www.orula.org/orula/${primary}Wiki.nsf`;
}
