/**
 * NSGA-II — Non-dominated Sorting Genetic Algorithm II
 * Deb et al., IEEE TEC 2002.
 *
 * Generic multi-objective EA used here to evolve 21-day advice plans
 * under competing objectives (alignment, caution, diversity, pacing).
 */

export type Objectives = number[]; // all minimized

export interface Individual<T> {
  genome: T;
  objectives: Objectives;
  rank: number;
  crowdingDistance: number;
}

export interface Nsga2Config<T> {
  populationSize: number;
  generations: number;
  crossoverRate: number;
  mutationRate: number;
  objectiveCount: number;
  create: () => T;
  evaluate: (genome: T) => Objectives;
  crossover: (a: T, b: T) => [T, T];
  mutate: (genome: T, rate: number) => T;
  /** Optional RNG for tests; defaults to Math.random */
  random?: () => number;
}

function dominates(a: Objectives, b: Objectives): boolean {
  let strictlyBetter = false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > b[i]) return false; // worse on any objective (minimization)
    if (a[i] < b[i]) strictlyBetter = true;
  }
  return strictlyBetter;
}

/** Fast non-dominated sort → fronts of indices into `pop`. */
export function fastNonDominatedSort<T>(pop: Individual<T>[]): number[][] {
  const n = pop.length;
  const S: number[][] = Array.from({ length: n }, () => []);
  const nDom = new Array(n).fill(0);
  const fronts: number[][] = [[]];

  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      if (p === q) continue;
      if (dominates(pop[p].objectives, pop[q].objectives)) S[p].push(q);
      else if (dominates(pop[q].objectives, pop[p].objectives)) nDom[p]++;
    }
    if (nDom[p] === 0) {
      pop[p].rank = 0;
      fronts[0].push(p);
    }
  }

  let i = 0;
  while (fronts[i].length > 0) {
    const next: number[] = [];
    for (const p of fronts[i]) {
      for (const q of S[p]) {
        nDom[q]--;
        if (nDom[q] === 0) {
          pop[q].rank = i + 1;
          next.push(q);
        }
      }
    }
    i++;
    fronts.push(next);
  }
  fronts.pop();
  return fronts;
}

/** Crowding distance on one front (indices into pop). */
export function crowdingDistance<T>(
  pop: Individual<T>[],
  front: number[]
): void {
  const l = front.length;
  if (l === 0) return;
  for (const idx of front) pop[idx].crowdingDistance = 0;
  if (l <= 2) {
    for (const idx of front) pop[idx].crowdingDistance = Infinity;
    return;
  }

  const m = pop[front[0]].objectives.length;
  for (let obj = 0; obj < m; obj++) {
    const sorted = [...front].sort(
      (a, b) => pop[a].objectives[obj] - pop[b].objectives[obj]
    );
    pop[sorted[0]].crowdingDistance = Infinity;
    pop[sorted[l - 1]].crowdingDistance = Infinity;
    const min = pop[sorted[0]].objectives[obj];
    const max = pop[sorted[l - 1]].objectives[obj];
    const range = max - min || 1e-12;
    for (let i = 1; i < l - 1; i++) {
      const prev = pop[sorted[i - 1]].objectives[obj];
      const next = pop[sorted[i + 1]].objectives[obj];
      pop[sorted[i]].crowdingDistance += (next - prev) / range;
    }
  }
}

function crowdedCompare<T>(a: Individual<T>, b: Individual<T>): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return b.crowdingDistance - a.crowdingDistance;
}

function tournamentSelect<T>(
  pop: Individual<T>[],
  rnd: () => number
): Individual<T> {
  const i = Math.floor(rnd() * pop.length);
  const j = Math.floor(rnd() * pop.length);
  return crowdedCompare(pop[i], pop[j]) <= 0 ? pop[i] : pop[j];
}

function wrap<T>(genome: T, objectives: Objectives): Individual<T> {
  return { genome, objectives, rank: 0, crowdingDistance: 0 };
}

export interface Nsga2Result<T> {
  population: Individual<T>[];
  paretoFront: Individual<T>[];
  generationsRun: number;
  objectiveNames?: string[];
}

/**
 * Run NSGA-II. Returns final population sorted by rank then crowding,
 * plus the first (non-dominated) front.
 */
export function runNsga2<T>(cfg: Nsga2Config<T>): Nsga2Result<T> {
  const rnd = cfg.random ?? Math.random;
  const N = cfg.populationSize;

  let pop: Individual<T>[] = [];
  for (let i = 0; i < N; i++) {
    const g = cfg.create();
    pop.push(wrap(g, cfg.evaluate(g)));
  }

  {
    const fronts = fastNonDominatedSort(pop);
    for (const f of fronts) crowdingDistance(pop, f);
  }

  for (let gen = 0; gen < cfg.generations; gen++) {
    const offspring: Individual<T>[] = [];
    while (offspring.length < N) {
      const p1 = tournamentSelect(pop, rnd);
      const p2 = tournamentSelect(pop, rnd);
      let c1: T;
      let c2: T;
      if (rnd() < cfg.crossoverRate) {
        [c1, c2] = cfg.crossover(p1.genome, p2.genome);
      } else {
        c1 = p1.genome;
        c2 = p2.genome;
      }
      c1 = cfg.mutate(c1, cfg.mutationRate);
      c2 = cfg.mutate(c2, cfg.mutationRate);
      offspring.push(wrap(c1, cfg.evaluate(c1)));
      if (offspring.length < N) {
        offspring.push(wrap(c2, cfg.evaluate(c2)));
      }
    }

    const combined = pop.concat(offspring);
    const fronts = fastNonDominatedSort(combined);
    for (const f of fronts) crowdingDistance(combined, f);

    const next: Individual<T>[] = [];
    for (const front of fronts) {
      const members = front.map((i) => combined[i]);
      members.sort((a, b) => b.crowdingDistance - a.crowdingDistance);
      for (const ind of members) {
        if (next.length >= N) break;
        next.push(ind);
      }
      if (next.length >= N) break;
    }
    pop = next;
  }

  const finalFronts = fastNonDominatedSort(pop);
  for (const f of finalFronts) crowdingDistance(pop, f);
  pop.sort(crowdedCompare);

  const paretoFront = (finalFronts[0] || []).map((i) => pop[i]);
  // Re-sort pareto by crowding for display stability
  paretoFront.sort((a, b) => b.crowdingDistance - a.crowdingDistance);

  return {
    population: pop,
    paretoFront,
    generationsRun: cfg.generations,
  };
}

/**
 * Pick a compromise solution from the Pareto front:
 * normalize objectives to [0,1] and choose min L2 distance to ideal (0,…,0).
 */
export function pickKneePoint<T>(front: Individual<T>[]): Individual<T> | null {
  if (!front.length) return null;
  if (front.length === 1) return front[0];

  const m = front[0].objectives.length;
  const mins = Array(m).fill(Infinity);
  const maxs = Array(m).fill(-Infinity);
  for (const ind of front) {
    for (let i = 0; i < m; i++) {
      mins[i] = Math.min(mins[i], ind.objectives[i]);
      maxs[i] = Math.max(maxs[i], ind.objectives[i]);
    }
  }

  let best = front[0];
  let bestDist = Infinity;
  for (const ind of front) {
    let d = 0;
    for (let i = 0; i < m; i++) {
      const range = maxs[i] - mins[i] || 1;
      const n = (ind.objectives[i] - mins[i]) / range;
      d += n * n;
    }
    if (d < bestDist) {
      bestDist = d;
      best = ind;
    }
  }
  return best;
}
