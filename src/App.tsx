import { useEffect, useMemo, useState } from 'react';
import { throwOpele, type OduThrow } from './lib/opele';
import {
  corpusStats,
  extractSections,
  findOdu,
  type OduRecord,
  type SectionHit,
} from './lib/corpus';
import {
  buildTriangulationPrompt,
  localTriangulate,
  localizeTriangulationSnippets,
} from './lib/triangulate';
import {
  evolve21DayPlan,
  formatPlanMarkdown,
  localizePlan,
  type Plan21Result,
} from './lib/plan21';
import {
  describeReading,
  localizeReading,
  type ReadingDescription,
} from './lib/meanings';
import { translateToEnglish } from './lib/translate';
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

type Tab = 'reading' | 'corpus' | 'plan';

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
  const [tab, setTab] = useState<Tab>('reading');
  const [reading, setReading] = useState<ReadingDescription | null>(null);
  const [enSections, setEnSections] = useState<SectionHit[]>([]);
  const [enFullText, setEnFullText] = useState('');
  const [seekerName, setSeekerName] = useState('');
  const [question, setQuestion] = useState('');

  useEffect(() => {
    loadCorpus().then(setCorpus).catch(() => setCorpus([]));
  }, []);

  const stats = useMemo(() => corpusStats(corpus), [corpus]);
  const mainRecord = main ? findOdu(corpus, main.id) : undefined;
  const sections = useMemo(
    () => extractSections(mainRecord?.text || ''),
    [mainRecord]
  );
  const canCast =
    seekerName.trim().length > 0 && question.trim().length > 0;

  const localizeAfterCast = async (
    th: OduThrow,
    record: OduRecord | undefined,
    inquiry: { seekerName: string; question: string }
  ) => {
    const base: ReadingDescription = {
      ...describeReading(th, record),
      seekerName: inquiry.seekerName,
      question: inquiry.question,
    };
    setReading(base);
    const localized = await localizeReading(base);
    setReading({
      ...localized,
      seekerName: inquiry.seekerName,
      question: inquiry.question,
    });

    const secs = extractSections(record?.text || '');
    const translatedSecs: SectionHit[] = [];
    for (const s of secs.slice(0, 6)) {
      translatedSecs.push({
        title: await translateToEnglish(s.title),
        body: await translateToEnglish(s.body.slice(0, 800)),
      });
    }
    setEnSections(translatedSecs);

    if (record?.text) {
      setEnFullText(await translateToEnglish(record.text.slice(0, 2500)));
    } else {
      setEnFullText('');
    }
  };

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
    const name = seekerName.trim();
    const q = question.trim();
    if (!name || !q) return;
    animateThrow(() => {
      const t = throwOpele();
      setMain(t);
      setSupports([]);
      setTriText('');
      setTriMode('idle');
      setShowFull(false);
      setPlan(null);
      setEnSections([]);
      setEnFullText('');
      setTab('reading');
      const rec = findOdu(corpus, t.id);
      void localizeAfterCast(t, rec, { seekerName: name, question: q });
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
      void (async () => {
        const records = [
          { throw: main, record: findOdu(corpus, main.id) },
          ...supports.map((s) => ({ throw: s, record: findOdu(corpus, s.id) })),
        ];
        const result = evolve21DayPlan(main, supports, records, {
          populationSize: 48,
          generations: 40,
          startDate: new Date(),
        });
        const enPlan = await localizePlan(result);
        setPlan(enPlan);
        if (!triText) {
          setTriText(formatPlanMarkdown(enPlan));
          setTriMode('local');
        }
        setPlanBusy(false);
        setTab('plan');
      })();
    }, 40);
  };

  const onTriangulate = async () => {
    if (!main) return;
    setBusy(true);
    const records = [
      { throw: main, record: findOdu(corpus, main.id) },
      ...supports.map((s) => ({ throw: s, record: findOdu(corpus, s.id) })),
    ];
    const inquiry = {
      seekerName: reading?.seekerName || seekerName.trim(),
      question: reading?.question || question.trim(),
    };
    const prompt = buildTriangulationPrompt(main, supports, records, inquiry);

    if (window.opwele?.triangulateOpenAI) {
      const res = await window.opwele.triangulateOpenAI({ prompt });
      if (res.ok && res.text) {
        setTriText(res.text);
        setTriMode('openai');
        setBusy(false);
        setTab('reading');
        return;
      }
    }

    const local = localTriangulate(main, supports, records, inquiry);
    const en = await localizeTriangulationSnippets(local);
    setTriText(en);
    setTriMode('local');
    setBusy(false);
    setTab('reading');
  };

  const corpusSections = enSections.length ? enSections : sections;

  return (
    <div className="app">
      <header className="hero">
        <p className="hero-kicker">Ifá · Lucumí</p>
        <h1 className="hero-brand">Opwele</h1>
        <p className="hero-sub">
          Name yourself and the question you bring, cast the opelé, and see what
          was divined — in English — plus a 21-day plan.
        </p>
        <div className="corpus-pill">
          <strong>
            {stats.withText}/{stats.total || 256}
          </strong>{' '}
          odùs in corpus
        </div>
      </header>

      <section className="cast-stage">
        <OpeleVisual throwData={main} spinning={spinning} />

        <div className="cast-actions">
          <div className="cast-intake">
            <label className="cast-field" htmlFor="seeker-name">
              Name
              <input
                id="seeker-name"
                type="text"
                autoComplete="name"
                placeholder="Who is asking?"
                value={seekerName}
                onChange={(e) => setSeekerName(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="cast-field" htmlFor="seeker-question">
              Question
              <textarea
                id="seeker-question"
                rows={2}
                placeholder="What do you bring to Ifá?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={busy}
              />
            </label>
            {!canCast && (
              <p className="cast-intake-hint">
                Enter your name and question before casting.
              </p>
            )}
          </div>

          <button
            className="btn btn-primary btn-lg"
            onClick={onMainThrow}
            disabled={busy || !canCast}
            type="button"
          >
            {spinning ? 'Casting…' : 'Cast opelé'}
          </button>

          <div className="cast-row">
            <label className="support-count" htmlFor="sup">
              Supports
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
              Supports
            </button>
          </div>

          <div className="cast-row">
            <button
              className="btn"
              onClick={onTriangulate}
              disabled={busy || !main}
              type="button"
            >
              Triangulate
            </button>
            <button
              className="btn btn-primary"
              onClick={onPlan21}
              disabled={busy || planBusy || !main}
              type="button"
            >
              {planBusy ? 'Evolving…' : '21 days'}
            </button>
          </div>
        </div>
      </section>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ['reading', 'Reading'],
            ['corpus', 'Corpus'],
            ['plan', '21 days'],
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

      {tab === 'reading' && (
        <div className="tab-panel">
          <ReadingCard
            reading={reading}
            sourceUrl={main?.sourceUrl}
            isMeji={main?.isMeji}
          />

          {supports.length > 0 && (
            <section className="panel soft">
              <h2>Supporting omolúos</h2>
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
                        source
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {triMode !== 'idle' && (
            <section className="panel soft">
              <h2>Triangulation</h2>
              <span className="mode-tag">
                {triMode === 'openai' ? 'OpenAI · English' : 'Local · English'}
              </span>
              <div className="tri-out">{renderMarkdownLite(triText)}</div>
            </section>
          )}
        </div>
      )}

      {tab === 'corpus' && (
        <div className="tab-panel">
          <section className="panel soft">
            <h2>Odù corpus (English)</h2>
            {!main && (
              <p className="empty-hint">Cast the opelé to load the text.</p>
            )}
            {main && !mainRecord?.text && (
              <p className="empty-hint">
                No local text for {main.id}. Run <code>npm run scrape</code>.
              </p>
            )}
            {main && mainRecord?.text && (
              <>
                {reading?.translating && (
                  <p className="empty-hint">Translating corpus sections…</p>
                )}
                {corpusSections.length > 0 ? (
                  <div className="sections">
                    {corpusSections.map((s, i) => (
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
                  <p className="empty-hint">No labeled sections yet.</p>
                )}
                <button
                  className="btn btn-ghost"
                  type="button"
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => setShowFull((v) => !v)}
                >
                  {showFull ? 'Hide full text' : 'Full text (EN)'}
                </button>
                {showFull && (
                  <div className="full-text">
                    {enFullText || mainRecord.text}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {tab === 'plan' && (
        <div className="tab-panel">
          {!plan && (
            <section className="panel soft">
              <h2>21-day plan</h2>
              <p className="empty-hint">
                Cast the opelé and tap «21 days» to evolve advice with NSGA-II
                (shown in English).
              </p>
            </section>
          )}
          {plan && (
            <section className="panel soft plan-panel">
              <h2>21-day counsel — NSGA-II</h2>
              <p className="plan-summary">{plan.summary}</p>

              <div className="nsga-meta">
                <div>
                  <span className="meta-k">Population</span>
                  <span className="meta-v">{plan.populationSize}</span>
                </div>
                <div>
                  <span className="meta-k">Generations</span>
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
                    ['Alignment', plan.objectives.alignmentGap],
                    ['Caution', plan.objectives.cautionGap],
                    ['Monotony', plan.objectives.monotony],
                    ['Strain', plan.objectives.pacingStrain],
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
                      <span className="day-num">Day {d.day}</span>
                      <span className="day-date">{d.dateISO}</span>
                    </header>
                    <div className="day-kind">{d.action.kind}</div>
                    <h3>{d.action.label}</h3>
                    <p>{d.action.detail}</p>
                    <footer>source: {d.action.sourceOdu}</footer>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <footer className="app-foot">
        Educational guidance · does not replace a babalawo · corpus orula.org
        (translated on cast)
      </footer>
    </div>
  );
}
