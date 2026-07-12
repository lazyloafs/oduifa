import { useEffect, useMemo, useState } from 'react';
import { throwOpele, type OduThrow } from './lib/opele';
import {
  corpusStats,
  extractSections,
  findOdu,
  type OduRecord,
} from './lib/corpus';
import { buildTriangulationPrompt, localTriangulate } from './lib/triangulate';
import {
  evolve21DayPlan,
  formatPlanMarkdown,
  type Plan21Result,
} from './lib/plan21';
import { describeReading } from './lib/meanings';
import { OpeleVisual } from './components/OpeleVisual';
import { ReadingCard } from './components/ReadingCard';
import fallbackCorpus from '../data/odus.json';

async function loadCorpus(): Promise<OduRecord[]> {
  if (window.opwele?.loadCorpus) {
    const res = await window.opwele.loadCorpus();
    if (res.ok && Array.isArray(res.data)) return res.data as OduRecord[];
  }
  return (fallbackCorpus as OduRecord[]) || [];
}

function renderMarkdownLite(text: string) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## '))
      return (
        <h2 key={i}>{line.replace(/^##\s+/, '').replace(/\*\*/g, '')}</h2>
      );
    if (line.startsWith('### '))
      return (
        <h3 key={i}>{line.replace(/^###\s+/, '').replace(/\*\*/g, '')}</h3>
      );
    if (line.startsWith('• ') || line.startsWith('- '))
      return <div key={i}>{line}</div>;
    if (!line.trim()) return <br key={i} />;
    const html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return <div key={i} dangerouslySetInnerHTML={{ __html: html }} />;
  });
}

type Tab = 'lectura' | 'corpus' | 'plan';

export default function App() {
  const [corpus, setCorpus] = useState<OduRecord[]>([]);
  const [main, setMain] = useState<OduThrow | null>(null);
  const [supports, setSupports] = useState<OduThrow[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [supportCount, setSupportCount] = useState(3);
  const [triText, setTriText] = useState('');
  const [triMode, setTriMode] = useState<'idle' | 'local' | 'openai'>('idle');
  const [busy, setBusy] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [plan, setPlan] = useState<Plan21Result | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('lectura');

  useEffect(() => {
    loadCorpus().then(setCorpus).catch(() => setCorpus([]));
  }, []);

  const stats = useMemo(() => corpusStats(corpus), [corpus]);
  const mainRecord = main ? findOdu(corpus, main.id) : undefined;
  const sections = useMemo(
    () => extractSections(mainRecord?.text || ''),
    [mainRecord]
  );
  const reading = useMemo(
    () => (main ? describeReading(main, mainRecord) : null),
    [main, mainRecord]
  );

  const animateThrow = (fn: () => void) => {
    setSpinning(true);
    setBusy(true);
    window.setTimeout(() => {
      fn();
      setSpinning(false);
      setBusy(false);
    }, 900);
  };

  const onMainThrow = () => {
    animateThrow(() => {
      const t = throwOpele();
      setMain(t);
      setSupports([]);
      setTriText('');
      setTriMode('idle');
      setShowFull(false);
      setPlan(null);
      setTab('lectura');
    });
  };

  const onSupports = () => {
    if (!main) return;
    animateThrow(() => {
      const n = Math.min(4, Math.max(2, supportCount));
      const list: OduThrow[] = [];
      for (let i = 0; i < n; i++) list.push(throwOpele());
      setSupports(list);
      setTriText('');
      setTriMode('idle');
      setPlan(null);
    });
  };

  const onPlan21 = () => {
    if (!main) return;
    setPlanBusy(true);
    window.setTimeout(() => {
      const records = [
        { throw: main, record: findOdu(corpus, main.id) },
        ...supports.map((s) => ({ throw: s, record: findOdu(corpus, s.id) })),
      ];
      const result = evolve21DayPlan(main, supports, records, {
        populationSize: 48,
        generations: 40,
        startDate: new Date(),
      });
      setPlan(result);
      if (!triText) {
        setTriText(formatPlanMarkdown(result));
        setTriMode('local');
      }
      setPlanBusy(false);
      setTab('plan');
    }, 40);
  };

  const onTriangulate = async () => {
    if (!main) return;
    setBusy(true);
    const records = [
      { throw: main, record: findOdu(corpus, main.id) },
      ...supports.map((s) => ({ throw: s, record: findOdu(corpus, s.id) })),
    ];
    const prompt = buildTriangulationPrompt(main, supports, records);

    if (window.opwele?.triangulateOpenAI) {
      const res = await window.opwele.triangulateOpenAI({ prompt });
      if (res.ok && res.text) {
        setTriText(res.text);
        setTriMode('openai');
        setBusy(false);
        setTab('lectura');
        return;
      }
    }

    setTriText(localTriangulate(main, supports, records));
    setTriMode('local');
    setBusy(false);
    setTab('lectura');
  };

  return (
    <div className="app">
      <header className="hero">
        <p className="hero-kicker">Ifá · Lucumí</p>
        <h1 className="hero-brand">Opwele</h1>
        <p className="hero-sub">
          Tire el opelé, lea el signo y reciba lo que se divinó — con plan de 21
          días.
        </p>
        <div className="corpus-pill">
          <strong>
            {stats.withText}/{stats.total || 256}
          </strong>{' '}
          odùs en corpus
        </div>
      </header>

      {/* Hero cast stage */}
      <section className="cast-stage">
        <OpeleVisual throwData={main} spinning={spinning} />

        <div className="cast-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={onMainThrow}
            disabled={busy}
            type="button"
          >
            {spinning ? 'Girando…' : 'Tirar opelé'}
          </button>

          <div className="cast-row">
            <label className="support-count" htmlFor="sup">
              Omoluós
              <input
                id="sup"
                type="number"
                min={2}
                max={4}
                inputMode="numeric"
                value={supportCount}
                onChange={(e) => setSupportCount(Number(e.target.value) || 3)}
              />
            </label>
            <button
              className="btn"
              onClick={onSupports}
              disabled={busy || !main}
              type="button"
            >
              Apoyos
            </button>
          </div>

          <div className="cast-row">
            <button
              className="btn"
              onClick={onTriangulate}
              disabled={busy || !main}
              type="button"
            >
              Triangular
            </button>
            <button
              className="btn btn-primary"
              onClick={onPlan21}
              disabled={busy || planBusy || !main}
              type="button"
            >
              {planBusy ? 'Evolucionando…' : '21 días'}
            </button>
          </div>
        </div>
      </section>

      {/* Mobile tabs */}
      <nav className="tabs" aria-label="Secciones">
        {(
          [
            ['lectura', 'Lectura'],
            ['corpus', 'Corpus'],
            ['plan', '21 días'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'plan' && plan ? ' ·' : ''}
          </button>
        ))}
      </nav>

      {tab === 'lectura' && (
        <div className="tab-panel">
          <ReadingCard
            reading={reading}
            sourceUrl={main?.sourceUrl}
            isMeji={main?.isMeji}
          />

          {supports.length > 0 && (
            <section className="panel soft">
              <h2>Omoluós de apoyo</h2>
              <ul className="omoluo-list">
                {supports.map((s, i) => (
                  <li key={`${s.id}-${i}`}>
                    <div className="omoluo-mini">
                      <OpeleVisual throwData={s} compact />
                    </div>
                    <div className="omoluo-info">
                      <span className="idx">#{i + 1}</span>
                      <strong>{s.displayName}</strong>
                      <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                        fuente
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {triMode !== 'idle' && (
            <section className="panel soft">
              <h2>Triangulación</h2>
              <span className="mode-tag">
                {triMode === 'openai' ? 'OpenAI' : 'Síntesis local'}
              </span>
              <div className="tri-out">{renderMarkdownLite(triText)}</div>
            </section>
          )}
        </div>
      )}

      {tab === 'corpus' && (
        <div className="tab-panel">
          <section className="panel soft">
            <h2>Corpus del odù</h2>
            {!main && (
              <p className="empty-hint">Tire el opelé para cargar el texto.</p>
            )}
            {main && !mainRecord?.text && (
              <p className="empty-hint">
                Sin texto local para {main.id}. Ejecute{' '}
                <code>npm run scrape</code>.
              </p>
            )}
            {main && mainRecord?.text && (
              <>
                {sections.length > 0 ? (
                  <div className="sections">
                    {sections.map((s, i) => (
                      <div className="section-card" key={i}>
                        <h3>{s.title}</h3>
                        <p>
                          {s.body.slice(0, 600)}
                          {s.body.length > 600 ? '…' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="empty-hint">Sin secciones etiquetadas.</p>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => setShowFull((v) => !v)}
                >
                  {showFull ? 'Ocultar texto' : 'Texto completo'}
                </button>
                {showFull && <div className="full-text">{mainRecord.text}</div>}
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'plan' && (
        <div className="tab-panel">
          {!plan && (
            <section className="panel soft">
              <h2>Plan de 21 días</h2>
              <p className="empty-hint">
                Tire el opelé y pulse «21 días» para evolucionar un consejo con
                NSGA-II.
              </p>
            </section>
          )}
          {plan && (
            <section className="panel soft plan-panel">
              <h2>Consejo de 21 días — NSGA-II</h2>
              <p className="plan-summary">{plan.summary}</p>

              <div className="nsga-meta">
                <div>
                  <span className="meta-k">Población</span>
                  <span className="meta-v">{plan.populationSize}</span>
                </div>
                <div>
                  <span className="meta-k">Generaciones</span>
                  <span className="meta-v">{plan.generations}</span>
                </div>
                <div>
                  <span className="meta-k">Pareto</span>
                  <span className="meta-v">{plan.paretoSize}</span>
                </div>
                <div>
                  <span className="meta-k">Pool</span>
                  <span className="meta-v">{plan.poolSize}</span>
                </div>
              </div>

              <div className="obj-bars">
                {(
                  [
                    ['Alineación', plan.objectives.alignmentGap],
                    ['Cuidados', plan.objectives.cautionGap],
                    ['Monotonía', plan.objectives.monotony],
                    ['Tensión', plan.objectives.pacingStrain],
                  ] as [string, number][]
                ).map(([label, v]) => (
                  <div className="obj-bar" key={label}>
                    <div className="obj-bar-head">
                      <span>{label}</span>
                      <span>{(v * 100).toFixed(0)}%</span>
                    </div>
                    <div className="obj-bar-track">
                      <div
                        className="obj-bar-fill"
                        style={{ width: `${Math.max(4, (1 - v) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {plan.concepts.length > 0 && (
                <div className="concept-row">
                  {plan.concepts.map((c) => (
                    <span className="concept-chip" key={c}>
                      {c}
                    </span>
                  ))}
                </div>
              )}

              <div className="day-grid">
                {plan.days.map((d) => (
                  <article
                    className={`day-card kind-${d.action.kind}`}
                    key={d.day}
                  >
                    <header>
                      <span className="day-num">Día {d.day}</span>
                      <span className="day-date">{d.dateISO}</span>
                    </header>
                    <div className="day-kind">{d.action.kind}</div>
                    <h3>{d.action.label}</h3>
                    <p>{d.action.detail}</p>
                    <footer>fuente: {d.action.sourceOdu}</footer>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <footer className="app-foot">
        Orientación educativa · no sustituye a un babalawo · corpus orula.org
      </footer>
    </div>
  );
}
