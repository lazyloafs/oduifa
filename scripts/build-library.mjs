// Build data/library/public-domain.json from archive.org OCR text.
//
//   node scripts/build-library.mjs                 # downloads the three books
//   node scripts/build-library.mjs --cache ./raw   # use already-downloaded <archiveId>.txt files
//
// Every passage is cut from the OCR text between two anchor phrases, so nothing is retyped.
// Cleanups (OCR fixes such as Odii→Odu) are declared per passage in `fix`, and the build FAILS
// unless the cleaned `text` equals the OCR excerpt (after `fix`) once punctuation, spacing and
// case are ignored. The raw OCR is stored alongside as `ocr` so the cleaning can be audited.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheIdx = process.argv.indexOf('--cache');
const CACHE = cacheIdx > -1 ? process.argv[cacheIdx + 1] : null;

const SOURCES = [
  {
    id: 'ellis-1894',
    short: 'Ellis 1894',
    author: 'A. B. Ellis',
    title: 'The Yoruba-speaking Peoples of the Slave Coast of West Africa',
    year: 1894,
    archiveId: 'yorubaspeakingp00elligoog',
    license: 'Public domain (author d. 1894)',
  },
  {
    id: 'dennett-1906',
    short: 'Dennett 1906',
    author: 'R. E. Dennett',
    title: "At the Back of the Black Man's Mind",
    year: 1906,
    archiveId: 'atbackofblackman00denn',
    license: 'Public domain (author d. 1921)',
  },
  {
    id: 'farrow-1926',
    short: 'Farrow 1926',
    author: 'S. S. Farrow',
    title: 'Faith, Fancies and Fetich, or Yoruba Paganism',
    year: 1926,
    archiveId: 'faithfanciesfeti00farr',
    license: 'Public domain in the US by publication date (author’s death date not verified)',
  },
].map((s) => ({ ...s, url: `https://archive.org/details/${s.archiveId}` }));

const DENNETT_ODU = [['Odiis', 'Odus'], ['Odii', 'Odu']];

/** parts: [{from, to, fix?, text}] — `text` defaults to the fixed excerpt. */
const PASSAGES = [
  {
    id: 'method-story',
    source: 'farrow-1926',
    locator: 'p. 39',
    role: 'method',
    point: 'method',
    parts: [{ from: 'Then, when an Odu appears', to: 'prescribes the appropriate sacrifice.' }],
  },
  {
    id: 'method-parable',
    source: 'farrow-1926',
    locator: 'p. 39',
    role: 'method',
    point: 'parable',
    parts: [
      { from: 'The response of an Odu is given in the form of a parable.', to: 'in the form of a parable.' },
      {
        from: 'Ifa always speaks in parables',
        to: 'It is not fulfilled !)',
        text: 'Ifa always speaks in parables,\nIt is the wise man who understands—\nIf we should say we understand—\nThe wise man will understand—\nWhen we do not understand,\nWe say, It is of no account! (or, It is not fulfilled!)',
      },
    ],
    joiner: '\n\n',
  },
  {
    id: 'ifa-role',
    source: 'farrow-1926',
    locator: 'p. 36',
    role: 'method',
    point: 'ifa-role',
    parts: [
      {
        from: 'he is the greatest oracle of the whole Yoruba country',
        to: 'what sacrifices they demand.',
        text: '…he is the greatest oracle of the whole Yoruba country and is consulted on all important occasions. He decides what orisha each new-born child is to worship. He tells, in time of trouble, famine, sickness, etc., which gods have been offended and what sacrifices they demand.',
      },
    ],
  },
  {
    id: 'stories-dennett',
    source: 'dennett-1906',
    locator: 'Appendix, p. 247',
    role: 'method',
    point: 'stories',
    parts: [
      {
        from: 'There is a series of traditional stories',
        to: 'to perform the feat.',
        fix: DENNETT_ODU,
        text: 'There is a series of traditional stories, each of which is called a road, a pathway, or a course, and is connected with some particular Odu. Each Odu is supposed to have 1,680 of these stories connected with it, and these, together with those of the other Odus, every one aspiring to the office of "A Babalawo" who is a divining or sacrificing priest, is expected to commit to memory, though scarcely has any one been found to perform the feat.',
      },
    ],
  },
  {
    id: 'stories-farrow',
    source: 'farrow-1926',
    locator: 'p. 39',
    role: 'method',
    point: 'stories',
    parts: [
      {
        from: 'in connection with each Odu there are supposed to be 1680',
        to: 'which must be memorised',
        text: '…in connection with each Odu there are supposed to be 1680 traditional stories, each of which is represented by a brief couplet, which must be memorised…',
      },
    ],
  },
  {
    id: 'opele-dennett',
    source: 'dennett-1906',
    locator: 'ch. XXII, p. 233',
    role: 'opele',
    point: 'opele',
    parts: [
      {
        from: 'But Ifa is always attended by his offspring',
        to: 'consult every day.',
        fix: [['Op^LE', 'Opele']],
        text: 'But Ifa is always attended by his offspring Opele, the other great oracular God of the Yoruba whom the diviners consult every day.',
      },
    ],
  },
  {
    id: 'opele-ellis',
    source: 'ellis-1894',
    locator: 'ch. on the gods, no. 6 “Ifa” (page not verified; OCR is noisy)',
    role: 'opele',
    point: 'opele',
    parts: [
      {
        from: 'Ifa has an attendant or companion named Odu',
        to: 'palm-tree).',
        fix: [['pnzzle', 'puzzle']],
        text: 'Ifa has an attendant or companion named Odu (? One who emulates), and a messenger called Opele (ope, puzzle, or ope, palm-tree).',
      },
    ],
  },
  {
    id: 'medicine-dennett',
    source: 'dennett-1906',
    locator: 'Appendix, p. 254',
    role: 'health',
    point: 'medicine',
    jev: 'filter',
    parts: [
      {
        from: 'in the traditional sayings of every Olodu',
        to: 'cured them effectually.',
        text: '…in the traditional sayings of every Olodu, or Odu, mention is always to be found made of sufferers from this or that form of disease and of the remedies that cured them effectually.',
      },
    ],
  },
  {
    id: 'ejiogbe-principal',
    source: 'dennett-1906',
    locator: 'Appendix, p. 247',
    role: 'principal',
    point: 'ejiogbe-principal',
    applies: { odus: ['Ejiogbe'] },
    parts: [
      {
        from: 'Eji Ogbfe is regarded the most principal',
        to: 'one of uncommon importance.',
        fix: [['Ogbfe', 'Ogbe']],
        text: 'Eji Ogbe is regarded the most principal, "The Dux" or "Imperabor" and King, whose appearance on the consulting bowl is always regarded as indicating the communication of a message of very great importance, since earthly sovereigns are not accustomed to come and stand out before their people themselves and set aside for the time being their representatives or deputies except when the communication to be delivered is one of uncommon importance.',
      },
    ],
  },
  {
    id: 'ejiogbe-verse',
    source: 'farrow-1926',
    locator: 'p. 40',
    role: 'verse',
    point: 'ejiogbe-verse',
    jev: 'annotate',
    applies: { odus: ['Ejiogbe'] },
    note: 'Farrow gives this as a verse a babalawo may recite with the authority of Eji Ogbe when it appears (English translation only; the Yoruba text is omitted because its OCR is unusable).',
    parts: [
      {
        from: 'When we wash our face',
        to: 'come to pass!',
        fix: [['“‘ 1t', 'It']],
        text: 'When we wash our face,\nWhen we wash our nose,\nWe finish off beneath the chin.\nIfa was consulted for Orunmila once, going to receive authority from the Almighty. He sacrificed. And the Almighty gave him authority. When all the world heard that he had received authority from the Almighty they came to him. All that he said came to pass. Ever since then we say, "It will come to pass!"',
      },
    ],
  },
  {
    id: 'combination-dennett',
    source: 'dennett-1906',
    locator: 'Appendix, p. 247',
    role: 'combination',
    point: 'combination',
    applies: { nonMeji: true },
    convention: 'left-first',
    parts: [
      {
        from: 'Subordinate Odiis are constituted',
        to: 'to give them their respective names',
        fix: [...DENNETT_ODU, ['con- junction', 'conjunction']],
        text: 'Subordinate Odus are constituted and represented by the conjunction of two principal Odus at one and the same time upon the consulting and divining bowl, the one on the right and the other on the left, this simultaneous appearance and their conjunction uniting to give them their respective names',
      },
      {
        from: 'The first of the two names in combination',
        to: 'left-hand side.',
        fix: DENNETT_ODU,
        text: 'The first of the two names in combination is always that of the Odu which appears on the left-hand side.',
      },
    ],
    joiner: ' […] ',
  },
  {
    id: 'meji-dennett',
    source: 'dennett-1906',
    locator: 'Appendix, p. 247',
    role: 'combination',
    point: 'meji',
    applies: { meji: true },
    parts: [
      {
        from: 'Ejl or meji means two',
        to: 'or a pair.',
        fix: [['Ejl', 'Eji']],
        text: 'Eji or meji means two, double, or a pair.',
      },
    ],
  },
];

const letters = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const squash = (s) => s.replace(/\s+/g, ' ');

async function loadBook(archiveId) {
  if (CACHE) {
    const p = path.join(CACHE, `${archiveId}.txt`);
    if (!existsSync(p)) throw new Error(`missing ${p}`);
    return squash(readFileSync(p, 'utf8'));
  }
  const res = await fetch(`https://archive.org/download/${archiveId}/${archiveId}_djvu.txt`);
  if (!res.ok) throw new Error(`${archiveId}: HTTP ${res.status}`);
  return squash(await res.text());
}

const books = {};
for (const s of SOURCES) books[s.id] = await loadBook(s.archiveId);

const out = [];
for (const p of PASSAGES) {
  const book = books[p.source];
  const texts = [];
  const ocrs = [];
  for (const part of p.parts) {
    const a = book.indexOf(part.from);
    if (a < 0) throw new Error(`${p.id}: anchor not found: "${part.from}"`);
    const b = book.indexOf(part.to, a);
    if (b < 0) throw new Error(`${p.id}: end anchor not found: "${part.to}"`);
    const raw = book.slice(a, b + part.to.length);
    if (raw.length > 1500) throw new Error(`${p.id}: excerpt unexpectedly long (${raw.length})`);
    let fixed = raw;
    for (const [x, y] of part.fix || []) fixed = fixed.split(x).join(y);
    const text = part.text ?? fixed;
    // Safety net: the cleaned text may differ from the OCR only by punctuation, spacing and an
    // ellipsis; any retyped or altered word fails the build.
    const same = letters(text) === letters(fixed);
    const trimmedHead = letters(fixed).startsWith(letters(text)) || letters(fixed).endsWith(letters(text));
    if (!same && !trimmedHead) {
      throw new Error(`${p.id}: cleaned text does not match OCR\n  text : ${text}\n  fixed: ${fixed}`);
    }
    texts.push(text);
    ocrs.push(raw);
  }
  const { parts, joiner = ' ', ...meta } = p;
  out.push({ ...meta, text: texts.join(joiner), ocr: ocrs.join(' […] ') });
}

const dir = path.join(ROOT, 'data', 'library');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'public-domain.json');
writeFileSync(
  file,
  JSON.stringify(
    {
      about:
        'Verbatim passages from public-domain books, cut from archive.org OCR text with minimal declared cleanups. Written by outside observers in the 19th and early 20th centuries; historical documents, not authoritative statements of the tradition.',
      sources: SOURCES,
      passages: out,
    },
    null,
    2
  ) + '\n'
);
console.log(`wrote ${out.length} passages from ${SOURCES.length} sources → ${path.relative(ROOT, file)}`);
