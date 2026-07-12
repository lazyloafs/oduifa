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
import fallbackCorpus from '../data/odus.json';

async function loadCorpus(): Promise<OduRecord[]> {
  if (window.opwele?.loadCorpus) {
    const res = await window.opwele.loadCorpus();
    if (res.ok && Array.isArray(res.data)) return res.data as OduRecord[];
  }
  return (fallbackCorpus as OduRecord[]) || [];
}

function ShellColumn({
  marks,
  label,
  spinning,
}: {
  marks: string[];
  label: string;
  spinning: boolean;
}) {
  return (
    <div className="column">
      <div className="column-label">{label}</div>
      {marks.map((m, i) => (
        <div
          key={`${label}-${i}-${m}`}
          className={`shell ${m} ${spinning ? 'spinning' : ''}`}
          style={{ animationDelay: `${i * 0.07}s` }}
        >
          {m}
        </div>
      ))}
    </div>
  );
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

  useEffect(() => {
    loadCorpus().then(setCorpus).catch(() => setCorpus([]));
  }, []);

  const stats = useMemo(() => corpusStats(corpus), [corpus]);
  const mainRecord = main ? findOdu(corpus, main.id) : undefined;
  const sections = useMemo(
    () => extractSections(mainRecord?.text || ''),
    [mainRecord]
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
    // Yield so the UI can show "evolving…" before the sync NSGA-II run
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
        return;
      }
    }

    setTriText(localTriangulate(main, supports, records));
    setTriMode('local');
    setBusy(false);
  };

  const placeholderMarks = ['I', 'II', 'I', 'II'];

  return (
    <div className="app">
      <header className="hero">
        <h1 className="hero-brand">Opwele</h1>
        <p className="hero-sub">
          Cadena de Ifá — tirada de opelé, omoluós de apoyo, triangulación del
          corpus orula.org y plan de 21 días evolucionado con NSGA-II.
        </p>
        <div className="corpus-pill">
          Corpus:{' '}
          <strong>
            {stats.withText}/{stats.total || 256}
          </strong>{' '}
          odùs
          {stats.withText < 200 && (
            <span> — ejecute npm run scrape para completar</span>
          )}
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <h2>Tirada del opelé</h2>
          <div className="actions">
            <button className="btn btn-primary" onClick={onMainThrow} disabled={busy}>
              Tirar opelé
            </button>
            <div className="support-count">
              <label htmlFor="sup">Omoluós</label>
              <input
                id="sup"
                type="number"
                min={2}
                max={4}
                value={supportCount}
                onChange={(e) => setSupportCount(Number(e.target.value) || 3)}
              />
            </div>
            <button className="btn" onClick={onSupports} disabled={busy || !main}>
              Tirar apoyos
            </button>
            <button
              className="btn"
              onClick={onTriangulate}
              disabled={busy || !main}
            >
              Triangular lectura
            </button>
            <button
              className="btn btn-primary"
              onClick={onPlan21}
              disabled={busy || planBusy || !main}
            >
              {planBusy ? 'Evolucionando…' : 'Plan 21 días (NSGA-II)'}
            </button>
          </div>

          <div className="opele-board">
            <ShellColumn
              label="Derecha · primario"
              marks={main?.right.marks || placeholderMarks}
              spinning={spinning}
            />
            <ShellColumn
              label="Izquierda · secundario"
              marks={main?.left.marks || placeholderMarks}
              spinning={spinning}
            />
          </div>

          {main ? (
            <div className="odu-result">
              <div className="odu-meta">Odù principal</div>
              <h3 className="odu-name">{main.displayName}</h3>
              <div className="marks-row">
                <span>{main.right.marks.join(' ')}</span>
                <span>·</span>
                <span>{main.left.marks.join(' ')}</span>
              </div>
              <p className="odu-meta">
                <a href={main.sourceUrl} target="_blank" rel="noreferrer">
                  Ver en orula.org
                </a>
                {main.isMeji ? ' · Meji' : ''}
              </p>
            </div>
          ) : (
            <p className="empty-hint">
              Pulse «Tirar opelé» para obtener uno de los 256 odùs (8 caracoles →
              dos piernas de 4).
            </p>
          )}

          {supports.length > 0 && (
            <>
              <h2 style={{ marginTop: '1.25rem' }}>Omoluós de apoyo</h2>
              <ul className="omoluo-list">
                {supports.map((s, i) => (
                  <li key={`${s.id}-${i}`}>
                    <span>
                      <span className="idx">#{i + 1}</span> {s.displayName}
                    </span>
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                      fuente
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="panel">
          <h2>Corpus del odù</h2>
          {!main && (
            <p className="empty-hint">El texto del odù principal aparecerá aquí.</p>
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
                      <p>{s.body.slice(0, 600)}{s.body.length > 600 ? '…' : ''}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-hint">
                  No se detectaron secciones etiquetadas; mostrando extracto.
                </p>
              )}
              <button
                className="btn btn-ghost"
                style={{ marginTop: '0.75rem' }}
                onClick={() => setShowFull((v) => !v)}
              >
                {showFull ? 'Ocultar texto completo' : 'Mostrar texto completo'}
              </button>
              {showFull && <div className="full-text">{mainRecord.text}</div>}
            </>
          )}

          <h2 style={{ marginTop: '1.5rem' }}>Triangulación</h2>
          {triMode === 'idle' && (
            <p className="empty-hint">
              Combina el principal y los apoyos. Con OPENAI_API_KEY usa OpenAI;
              si no, síntesis local offline del corpus.
            </p>
          )}
          {triMode !== 'idle' && (
            <>
              <span className="mode-tag">
                {triMode === 'openai' ? 'OpenAI' : 'Síntesis local'}
              </span>
              <div className="tri-out">{renderMarkdownLite(triText)}</div>
            </>
          )}
        </section>
      </div>

      {plan && (
        <section className="panel plan-panel">
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
              <span className="meta-k">Frente Pareto</span>
              <span className="meta-v">{plan.paretoSize}</span>
            </div>
            <div>
              <span className="meta-k">Acciones en pool</span>
              <span className="meta-v">{plan.poolSize}</span>
            </div>
          </div>

          <div className="obj-bars">
            {(
              [
                ['Alineación', plan.objectives.alignmentGap],
                ['Cuidados', plan.objectives.cautionGap],
                ['Monotonía', plan.objectives.monotony],
                ['Tensión ritmo', plan.objectives.pacingStrain],
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
              <article className={`day-card kind-${d.action.kind}`} key={d.day}>
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
  );
}
