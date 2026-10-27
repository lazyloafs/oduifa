import type { Verdict } from '../lib/jev';

export type ConsultState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; verdict: Verdict }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

interface Props {
  state: ConsultState;
  proverb?: string;
}

function RawTable({ verdict }: { verdict: Verdict }) {
  const rows = Object.entries(verdict.raw).map(([name, a]) => {
    if (a.type === 'choice') {
      const top = Object.entries(a.probabilities || {})
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([k, p]) => `${k} ${(p * 100).toFixed(0)}%`)
        .join(' · ');
      return [name, `${a.choice} (conf ${a.confidence.toFixed(2)})`, top];
    }
    if (a.type === 'noul') return [name, a.noul.toFixed(2), 'probability of yes'];
    return [name, a.score.toFixed(2), `conf ${a.confidence.toFixed(2)}`];
  });
  return (
    <details className="jev-raw">
      <summary>How this was read</summary>
      <table>
        <tbody>
          {rows.map(([k, v, extra]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{v}</td>
              <td>{extra}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="jev-raw-note">
        Typed answers from Jev{verdict.model ? ` (${verdict.model})` : ''} over the
        cast, the Spanish corpus excerpts and your question. Your name is not sent.
      </p>
    </details>
  );
}

export function BabalawoAnswer({ state, proverb }: Props) {
  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <section className="panel soft babalawo is-loading" aria-live="polite">
        <p className="reading-kicker">The babalawo’s answer</p>
        <p className="empty-hint">Reading the cast against your question…</p>
      </section>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <section className="panel soft babalawo is-muted">
        <p className="reading-kicker">The babalawo’s answer</p>
        <p className="empty-hint">{state.reason}</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section className="panel soft babalawo is-muted" role="status">
        <p className="reading-kicker">The babalawo’s answer</p>
        <p className="empty-hint">
          Could not reach the oracle service ({state.message}). The reading below
          is unaffected.
        </p>
      </section>
    );
  }

  const v = state.verdict;
  return (
    <section className={`panel soft babalawo kind-${v.kind}`} aria-live="polite">
      <p className="reading-kicker">
        The babalawo’s answer{v.topic ? ` · ${v.topic}` : ''}
      </p>
      <h2>{v.headline}</h2>
      {v.yesNo && (
        <span className={`verdict-chip chip-${v.yesNo}`}>
          {v.yesNo === 'conditional' ? 'Conditional' : v.yesNo === 'yes' ? 'Yes' : 'No'}
        </span>
      )}
      {v.lines.map((l, i) => (
        <p className="babalawo-line" key={i}>
          {l}
        </p>
      ))}
      {v.caution !== null && v.kind === 'answer' && (
        <div className="caution-meter" aria-label={`Caution ${(v.caution * 100).toFixed(0)}%`}>
          <div className="caution-track">
            <div className="caution-fill" style={{ width: `${Math.max(6, v.caution * 100)}%` }} />
          </div>
          <span>{v.cautionLabel}</span>
        </div>
      )}
      {v.kind === 'answer' && proverb && proverb !== '—' && (
        <blockquote className="reading-quote">
          <span className="quote-label">Ifá’s word</span>
          {proverb}
        </blockquote>
      )}
      {v.flags.some((f) => f.startsWith('conflict')) && (
        <p className="empty-hint">
          Parts of the reading pull in different directions, so this answer is
          held as conditional.
        </p>
      )}
      <RawTable verdict={v} />
      <p className="jev-disclaimer">
        Automatic reading of the corpus — it does not replace a babalawo.
      </p>
    </section>
  );
}
