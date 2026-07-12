# Odù Ifá / Opwele

Desktop **opelé** app for Cuban Lucumí / Ifá study: throw 8 shells → one of 256 odùs, pull supporting omoluós, triangulate against a local Spanish corpus from [orula.org](http://www.orula.org/), then evolve a **21-day advice plan with NSGA-II**.

Repo: [github.com/lazyloafs/oduifa](https://github.com/lazyloafs/oduifa)

## Flow

1. **Tirar opelé** — main odù (8 binary shells → right/left legs)
2. **Tirar apoyos** — 2–4 omoluós that refine the reading
3. **Triangular lectura** — OpenAI if `OPENAI_API_KEY` is set, else local corpus synthesis
4. **Plan 21 días (NSGA-II)** — multi-objective evolutionary search over daily actions distilled from the odù texts

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

## Stack

- Electron + Vite + React + TypeScript
- Offline corpus in `data/odus.json` (~254/256 pages; two combinations missing on orula.org)
- Optional OpenAI triangulation

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
