import type { Principal } from './opele';
import type { OduRecord, SectionHit } from './corpus';
import { extractSections } from './corpus';
import type { OduThrow } from './opele';

/** Short traditional character notes for the 16 principals (study aid). */
export const PRINCIPAL_MEANINGS: Record<
  Principal,
  { title: string; essence: string }
> = {
  Ejiogbe: {
    title: 'El que sostiene / el comienzo',
    essence:
      'Apertura, palabra, liderazgo y el principio de las cosas. Habla de caminos claros y de organizar la cabeza con el cuerpo.',
  },
  Oyeku: {
    title: 'La madre de la muerte / el cierre',
    essence:
      'Transformación, quietud y lo que se oculta. Pide respeto a los difuntos, precaución y no forzar lo que aún no madura.',
  },
  Iwori: {
    title: 'El vidente profundo',
    essence:
      'Intuición, investigación y ver detrás de las apariencias. Advierte contra la prisa y el chisme; favorece la observación.',
  },
  Idi: {
    title: 'El sello / el cierre del círculo',
    essence:
      'Conclusiones, fertilidad del asunto y fijar lo empezado. Habla de consolidar acuerdos y cuidar la espalda / base.',
  },
  Irosun: {
    title: 'El que resuena / la sangre y la raíz',
    essence:
      'Linaje, memoria y lo que “suena” en la sangre. Pide honrar a los mayores y no olvidar promesas hechas.',
  },
  Owonrin: {
    title: 'La cabeza invertida / el cambio',
    essence:
      'Inversión de planes, mudanzas y sorpresas. Lo que parece al revés puede acomodarse si se acepta el giro.',
  },
  Obara: {
    title: 'El que flota / la prosperidad incierta',
    essence:
      'Riqueza aparente, palabras dulces y riesgo de engaño. Exige honestidad en el trato y no confiar solo en apariencias.',
  },
  Okanran: {
    title: 'El que golpea / la confrontación',
    essence:
      'Choques, genio fuerte y justicia. Advierte no levantar la mano ni enredarse en pleitos; canalizar la fuerza.',
  },
  Ogunda: {
    title: 'El creador / el hierro',
    essence:
      'Trabajo, Oggún, corte y construcción. Favorable al esfuerzo concreto; cuidado con accidentes y herramientas.',
  },
  Osa: {
    title: 'El espíritu de Sa / el viento',
    essence:
      'Movimiento rápido, Oyá y cambios bruscos. Pide flexibilidad y no aferrarse a lo que el viento ya se lleva.',
  },
  Ika: {
    title: 'El controlador / el círculo',
    essence:
      'Límites, veneno y cura. Habla de controlar la lengua y el exceso; lo mismo que daña puede sanar con medida.',
  },
  Oturupon: {
    title: 'El portador / la carga',
    essence:
      'Peso, enfermedad y responsabilidad. Invita a aliviar cargas, cuidar la salud y no cargar lo ajeno.',
  },
  Otura: {
    title: 'El consolador / la buena palabra',
    essence:
      'Consuelo, enseñanza y caminos religiosos. Favorece estudiar, enseñar y hablar con verdad suave.',
  },
  Irete: {
    title: 'El que aplasta / la perseverancia',
    essence:
      'Presión, competencia y llegar lejos a fuerza de constancia. Cuidado con la soberbia al subir.',
  },
  Ose: {
    title: 'El conquistador / la victoria de Ochún',
    essence:
      'Dulzura, atracción y triunfo por la vía del cariño. Relacionado con Ochún; pide diplomacia y no la fuerza bruta.',
  },
  Oragun: {
    title: 'El dador / Ofún, la plenitud',
    essence:
      'Sabiduría blanca, pureza y dar/recibir. Habla de Obatalá, claridad mental y no manchar lo sagrado.',
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

  const ifaSays =
    sectionByTitle(sections, /if[aá]/i) ||
    (record?.text
      ? firstParagraph(record.text.replace(/^[\s\S]{0,80}?W[oó].*?dice/i, ''), 380)
      : '');

  const proverb =
    sectionByTitle(sections, /refr|proverb/i) ||
    '';

  const combinationNote = th.isMeji
    ? `${th.primary} Meji duplica su propia energía: el mensaje llega completo y sin mezcla. Es un odù mayor (Ojú Odù).`
    : `La pierna derecha (${th.primary}) marca el tono principal; la izquierda (${th.secondary}) matiza, corrige o apoya. Juntos forman el omolúo ${th.displayName}.`;

  const summaryParts = [
    `Lo que se divinó es **${th.displayName}**.`,
    right.essence,
    th.isMeji
      ? 'Al ser Meji, esa esencia se afirma con fuerza.'
      : `Se combina con la corriente de ${th.secondary}: ${left.essence}`,
  ];

  return {
    headline: th.displayName,
    summary: summaryParts.join(' '),
    ifaSays: ifaSays || 'Consulte el corpus completo o tire de nuevo cuando el texto esté disponible.',
    proverb: proverb || '—',
    rightMeaning: `${right.title}. ${right.essence}`,
    leftMeaning: th.isMeji
      ? `${right.title} (duplicado).`
      : `${left.title}. ${left.essence}`,
    combinationNote,
  };
}
