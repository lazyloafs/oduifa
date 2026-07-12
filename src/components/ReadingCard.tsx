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
        <h2>What was divined</h2>
        <p>
          Enter your name and the question you bring to Ifá, then cast the
          opelé. The odù, its meaning, and what Ifá says (translated to English
          from the orula.org corpus) will appear here.
        </p>
      </div>
    );
  }

  return (
    <article className="reading-card">
      <header className="reading-head">
        <p className="reading-kicker">What was divined</p>
        {(reading.seekerName || reading.question) && (
          <div className="reading-inquiry">
            {reading.seekerName && (
              <p className="reading-for">For {reading.seekerName}</p>
            )}
            {reading.question && (
              <blockquote className="reading-question">
                <span className="quote-label">Question</span>
                {reading.question}
              </blockquote>
            )}
          </div>
        )}
        <h2>{reading.headline}</h2>
        {isMeji && <span className="meji-badge">Meji · Major odù</span>}
        {reading.translating && (
          <span className="translate-badge">Translating to English…</span>
        )}
      </header>

      <p className="reading-summary">{reading.summary.replace(/\*\*/g, '')}</p>

      <div className="reading-legs">
        <div>
          <h3>Right (primary)</h3>
          <p>{reading.rightMeaning}</p>
        </div>
        <div>
          <h3>Left (support)</h3>
          <p>{reading.leftMeaning}</p>
        </div>
      </div>

      <p className="combo-note">{reading.combinationNote}</p>

      {reading.proverb && reading.proverb !== '—' && (
        <blockquote className="reading-quote">
          <span className="quote-label">Proverb</span>
          {reading.proverb}
        </blockquote>
      )}

      <div className="ifa-block">
        <h3>Ifá says</h3>
        <p>{reading.ifaSays}</p>
      </div>

      {sourceUrl && (
        <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
          Full text on orula.org →
        </a>
      )}
    </article>
  );
}
