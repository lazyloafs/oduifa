import type { Hit, LibraryResult } from '../lib/library';
import { LIBRARY_ABOUT } from '../lib/library';

interface Props {
  result: LibraryResult;
  /** Jev's 0–1 view of how directly each Jev-flagged passage bears on the question, if it ran. */
  bears?: Record<string, number>;
}

const BEARS_YES = 0.5;

function Quote({ hit, bears }: { hit: Hit; bears?: Record<string, number> }) {
  const { passage: p, source: s } = hit;
  const b = bears?.[p.id];
  return (
    <figure className="oldbook">
      <p className="oldbook-why">{hit.why}</p>
      <blockquote className="oldbook-text">{p.text}</blockquote>
      <figcaption>
        <a href={s.url} target="_blank" rel="noreferrer">
          {s.author}, <em>{s.title}</em> ({s.year})
        </a>
        , {p.locator} · {s.license}
      </figcaption>
      {p.note && <p className="oldbook-note">{p.note}</p>}
      {hit.agreeing.length > 0 && (
        <p className="oldbook-agree">
          Also in {hit.agreeing.map((a) => a.short).join(', ')} — the sources agree
          on this point.
        </p>
      )}
      {p.jev === 'annotate' && b !== undefined && (
        <p className="oldbook-note">
          {b >= BEARS_YES
            ? 'Reads as bearing on your question.'
            : 'Does not obviously bear on your question; shown because of the cast.'}
        </p>
      )}
      <details className="oldbook-ocr">
        <summary>Raw OCR</summary>
        <p>{p.ocr}</p>
      </details>
    </figure>
  );
}

export function OldBooks({ result, bears }: Props) {
  // "filter" passages need Jev's say-so; without it they stay out of the reading.
  const visible = (h: Hit) =>
    h.passage.jev !== 'filter' || (bears?.[h.passage.id] ?? 0) >= BEARS_YES;
  const cast = result.cast.filter(visible);
  const method = result.method.filter(visible);
  if (!cast.length && !method.length) return null;

  // Sources making the same point are shown once each; agreement is noted on every one.
  return (
    <section className="panel soft old-books">
      <p className="reading-kicker">From the old books</p>

      {cast.length > 0 && (
        <>
          <h2>In this cast</h2>
          {cast.map((h) => (
            <Quote key={h.passage.id} hit={h} bears={bears} />
          ))}
          {result.conventionNote && (
            <p className="oldbook-convention">{result.conventionNote}</p>
          )}
        </>
      )}

      {method.length > 0 && (
        <details className="oldbook-method" open={cast.length === 0}>
          <summary>How the oracle is read</summary>
          {method.map((h) => (
            <Quote key={h.passage.id} hit={h} bears={bears} />
          ))}
        </details>
      )}

      <p className="jev-disclaimer">
        {LIBRARY_ABOUT} Passages are from OCR text with minimal declared
        cleanups; check the scan before relying on a quotation.
      </p>
    </section>
  );
}
