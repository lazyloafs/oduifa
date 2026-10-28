# Odù Ifá / Opwele

Desktop **opelé** app for Cuban Lucumí / Ifá study: throw 8 shells → one of 256 odùs, pull supporting omoluós, triangulate against a local Spanish corpus from [orula.org](http://www.orula.org/), then evolve a **21-day advice plan with NSGA-II**.

Repo: [github.com/lazyloafs/oduifa](https://github.com/lazyloafs/oduifa)

## Flow

1. **Tirar opelé** — main odù (8 binary shells → right/left legs)
2. **Tirar apoyos** — 2–4 omoluós that refine the reading
3. **Triangular lectura** — OpenAI if `OPENAI_API_KEY` is set, else local corpus synthesis
4. **Plan 21 días (NSGA-II)** — multi-objective evolutionary search over daily actions distilled from the odù texts

Alongside step 1 (and again after step 2), **the babalawo's answer** reads the cast against the seeker's question with [Jev](https://typesafe.ai) — see below.

## NSGA-II (21-day advice)

[NSGA-II](https://ieeexplore.ieee.org/document/996017) (Deb et al.) maintains a Pareto front of plans that trade off competing goals. Here each individual is a **21-gene genome** (one advice action per day) drawn from a pool built from the main + support corpus (refranes, cuidados, prácticas, vínculos, plus rest anchors).

**Objectives (all minimized):**

| Objective | Meaning |
|-----------|---------|
| Alignment gap | How poorly the week covers themes of the main odù |
| Caution gap | Under/over-coverage of warnings vs a target cadence |
| Monotony | Low variety across practice / caution / relation / rest / study |
| Pacing strain | Too many high-intensity days in a row |

After evolution, the app picks a **knee / compromise** point on the Pareto front (closest in normalized space to the ideal) and renders a calendar of advice for the next 21 days.

Defaults: population 48, generations 40, crossover 0.9, mutation 0.12.

## The babalawo's answer (Jev)

When the opelé lands, the app sends the cast to TypeSafe's **Jev** model together with the seeker's question and the relevant parts of the odù's corpus text (*Ifá dice*, *Refranes*, *Nace en este signo*, *Síntesis profética*). Jev is a fast typed classifier, so it answers narrow questions in **one request**, and the English wording of the answer is composed in code from those typed answers (`src/lib/jev.ts`):

| Question | Type | Used for |
|----------|------|----------|
| `topic` | Choice | Area of life asked about |
| `sensitive` | Choice | Crisis / medical / legal / harm check — these get a human redirect instead of a divination |
| `is_yes_no` | Noul | Whether to give a short yes/no at all |
| `tone` | Choice | **Ire** / **Osogbo** / mixed / text silent on this matter |
| `favorable` | Noul | Yes / no / conditional (cross-checked against `tone`) |
| `caution` | Score | How much care the text asks (4 situation-based levels) |
| `advice` | Choice | Act now / wait / change approach / make an offering |
| `offering_mentioned` | Noul | Flags that the text mentions an ebó (to take to a babalawo) |
| `supports_effect` | Choice | After *Supports*: reinforce / soften / sharpen / unrelated |

Thresholds (confidence floors, yes/no cut-offs, the deliberately low self-harm trigger) live together at the top of `src/lib/jev.ts`. Low confidence yields "the opelé does not speak clearly to this" rather than a guess. A **How this was read** panel shows the raw probabilities.

Setup (desktop app only — the key stays in the Electron main process, never in the page):

```powershell
$env:TYPESAFE_API_KEY = "..."
# optional: pin a model once you've tuned thresholds on it
$env:TYPESAFE_MODEL = "jev-1.13.0"
npm run dev:electron
```

or put `TYPESAFE_API_KEY=...` in a `.env` file at the project root (gitignored). Without a key the card says so and the rest of the app works as before.

**Privacy:** the seeker's *name* is never sent; the question and corpus excerpts are. Test offline (no key needed) with `npm run test:jev`.

## The old books (public-domain library)

Under the babalawo's answer, a **From the old books** panel adds verbatim passages from public-domain books, picked by how the opelé landed and cited with author, year, page and a link to the scan:

| Landed | Passages shown |
|--------|----------------|
| Ejiogbe on a leg (or among the supports) | Dennett on Eji Ogbe as the principal odù whose appearance signals a message of great importance; Farrow's Eji Ogbe verse (English translation) |
| A Meji | Dennett: *eji / meji* means a pair |
| A mixed pair | Dennett on how two principal odùs combine — with a note that his source names the pair **left-first**, while this app follows the Cuban Lucumí convention (as orula.org does) and reads the **right leg first** |
| Always (collapsed) | How a babalawo reads (the story attached to an odù, the parable, the sacrifice prescribed), Ifá's role, and Opelé as Ifá's messenger/offspring — where two sources say the same thing, the panel says they agree |
| A question about health | Dennett's note that every odù's sayings mention sufferers and their remedies — shown only when Jev judges it bears on the question |

Sources (all on archive.org): Ellis, *The Yoruba-speaking Peoples of the Slave Coast* (1894); Dennett, *At the Back of the Black Man's Mind* (1906); Farrow, *Faith, Fancies and Fetich* (1926).

**What this is not.** These are accounts by outside observers, 1894–1926. They contain method and a handful of odù-specific notes, **not** a per-odù verse corpus; almost all printed collections of ese Ifá (Bascom, Abimbola, Fatunmbi, …) are still in copyright and are deliberately not included. The odù-by-odù text remains `data/odus.json` (orula.org).

Passages live in `data/library/public-domain.json`, cut from the archive.org OCR text between anchor phrases by `scripts/build-library.mjs`. Any OCR cleanup (e.g. *Odii* → *Odu*) is declared in that script, the raw OCR is stored beside each passage, and the build fails if a cleaned passage differs from its OCR by anything other than punctuation. Rebuild with `node scripts/build-library.mjs` (add `--cache <dir>` to reuse downloaded `<archiveId>.txt` files). The library works without a TypeSafe key; Jev only adds the relevance judgement.

## Stack

- Electron + Vite + React + TypeScript
- Offline corpus in `data/odus.json` (~254/256 pages; two combinations missing on orula.org)
- Optional OpenAI triangulation
- Optional Jev (`@typesafe-ai/sdk`) for the babalawo's answer

## Setup

```bash
cd Opwele   # or clone this repo
npm install
```

## Scrape corpus

```bash
npm run scrape
```

Resume-capable. Rate-limited (~300ms). Progress in `data/odus.json`.

## Run

```bash
npm run dev:electron    # desktop
npm run dev             # browser → http://127.0.0.1:5173
```

```powershell
$env:OPENAI_API_KEY = "sk-..."
npm run dev:electron
```

## Opele mapping

Each shell: **I** (open) = 1, **II** (closed) = 0. Right column = primary; left = secondary. Equal → Meji. See `src/lib/opele.ts`.

## Respect

Content belongs to the orula.org / Ifá community tradition. For personal study. Does **not** replace a babalawo. Scrape politely; do not republish the corpus commercially without permission.
