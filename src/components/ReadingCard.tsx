import type { ReadingDescription } from '../lib/meanings';

interface ReadingCardProps {
  reading: ReadingDescription | null;
  sourceUrl?: string;
  isMeji?: boolean;
}

export function ReadingCard({ reading, sourceUrl, isMeji }: ReadingCardProps) {
  if (!reading) {
    return (
      <div className="reading-card is-empty">
        <h2>Lo divinado</h2>
        <p>
          Cuando tire el opelé, aquí aparecerá el odù, su significado y lo que
          Ifá dice según el corpus de orula.org.
        </p>
      </div>
    );
  }

  return (
    <article className="reading-card">
      <header className="reading-head">
        <p className="reading-kicker">Lo que se divinó</p>
        <h2>{reading.headline}</h2>
        {isMeji && <span className="meji-badge">Meji · Odù mayor</span>}
      </header>

      <p className="reading-summary">{reading.summary.replace(/\*\*/g, '')}</p>

      <div className="reading-legs">
        <div>
          <h3>Derecha (principal)</h3>
          <p>{reading.rightMeaning}</p>
        </div>
        <div>
          <h3>Izquierda (apoyo)</h3>
          <p>{reading.leftMeaning}</p>
        </div>
      </div>

      <p className="combo-note">{reading.combinationNote}</p>

      {reading.proverb && reading.proverb !== '—' && (
        <blockquote className="reading-quote">
          <span className="quote-label">Refrán</span>
          {reading.proverb}
        </blockquote>
      )}

      <div className="ifa-block">
        <h3>Ifá dice</h3>
        <p>{reading.ifaSays}</p>
      </div>

      {sourceUrl && (
        <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
          Texto completo en orula.org →
        </a>
      )}
    </article>
  );
}
