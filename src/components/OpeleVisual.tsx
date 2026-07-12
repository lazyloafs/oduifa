import type { OduThrow } from '../lib/opele';

interface OpeleVisualProps {
  throwData: OduThrow | null;
  spinning?: boolean;
  compact?: boolean;
}

/** Illustrated opelé chain: 8 seed-pods on a cord, marks I / II for the cast sign. */
export function OpeleVisual({
  throwData,
  spinning = false,
  compact = false,
}: OpeleVisualProps) {
  const right = throwData?.right.marks ?? ['?', '?', '?', '?'];
  const left = throwData?.left.marks ?? ['?', '?', '?', '?'];
  const name = throwData?.displayName ?? '—';

  const w = compact ? 280 : 320;
  const h = compact ? 360 : 420;
  const cx = w / 2;
  const topY = 48;
  const gapY = compact ? 52 : 60;
  const colGap = compact ? 48 : 56;

  const pods = [0, 1, 2, 3].flatMap((i) => [
    { side: 'right' as const, i, mark: right[i], x: cx + colGap / 2, y: topY + i * gapY },
    { side: 'left' as const, i, mark: left[i], x: cx - colGap / 2, y: topY + i * gapY },
  ]);

  // Draw order: chain first, then pods
  const chainPointsRight = [0, 1, 2, 3].map((i) => ({
    x: cx + colGap / 2,
    y: topY + i * gapY,
  }));
  const chainPointsLeft = [0, 1, 2, 3].map((i) => ({
    x: cx - colGap / 2,
    y: topY + i * gapY,
  }));

  return (
    <figure className={`opele-visual ${spinning ? 'is-spinning' : ''} ${throwData ? 'has-throw' : ''}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="auto"
        role="img"
        aria-label={
          throwData
            ? `Opelé mostrando el signo ${name}`
            : 'Opelé listo para tirar'
        }
      >
        <defs>
          <linearGradient id="woodGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6b4423" />
            <stop offset="100%" stopColor="#3a2414" />
          </linearGradient>
          <radialGradient id="podOpen" cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#fff2c4" />
            <stop offset="55%" stopColor="#e0b84a" />
            <stop offset="100%" stopColor="#8b5a2b" />
          </radialGradient>
          <radialGradient id="podClosed" cx="60%" cy="70%" r="70%">
            <stop offset="0%" stopColor="#5a4030" />
            <stop offset="100%" stopColor="#1a100a" />
          </radialGradient>
          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Tray / ground */}
        <ellipse
          cx={cx}
          cy={h - 36}
          rx={w * 0.38}
          ry={18}
          fill="url(#woodGrad)"
          opacity="0.85"
        />
        <ellipse
          cx={cx}
          cy={h - 40}
          rx={w * 0.34}
          ry={10}
          fill="#2a1a10"
          opacity="0.5"
        />

        {/* Apex bead / handle */}
        <line
          x1={cx}
          y1={18}
          x2={cx}
          y2={topY - 8}
          stroke="#c4922a"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={16} r={7} fill="#e0b84a" stroke="#8b5a2b" strokeWidth="1.5" />

        {/* Split cords from apex to first pods */}
        <path
          d={`M ${cx} ${topY - 8} Q ${cx + 10} ${topY - 4} ${chainPointsRight[0].x} ${chainPointsRight[0].y - 14}`}
          fill="none"
          stroke="#a89078"
          strokeWidth="2"
        />
        <path
          d={`M ${cx} ${topY - 8} Q ${cx - 10} ${topY - 4} ${chainPointsLeft[0].x} ${chainPointsLeft[0].y - 14}`}
          fill="none"
          stroke="#a89078"
          strokeWidth="2"
        />

        {/* Vertical chains */}
        {[chainPointsRight, chainPointsLeft].map((pts, col) => (
          <g key={col}>
            {pts.slice(0, -1).map((p, i) => (
              <line
                key={i}
                x1={p.x}
                y1={p.y + 14}
                x2={pts[i + 1].x}
                y2={pts[i + 1].y - 14}
                stroke="#a89078"
                strokeWidth="2"
                strokeLinecap="round"
              />
            ))}
            {/* dangling end */}
            <line
              x1={pts[3].x}
              y1={pts[3].y + 14}
              x2={pts[3].x + (col === 0 ? 6 : -6)}
              y2={pts[3].y + 36}
              stroke="#a89078"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
        ))}

        {/* Seed pods */}
        {pods.map((p) => {
          const open = p.mark === 'I';
          const unknown = p.mark === '?';
          return (
            <g
              key={`${p.side}-${p.i}`}
              className={`pod ${spinning ? 'pod-spin' : ''}`}
              style={{ animationDelay: `${p.i * 0.06 + (p.side === 'left' ? 0.03 : 0)}s` }}
              filter="url(#softShadow)"
            >
              <ellipse
                cx={p.x}
                cy={p.y}
                rx={22}
                ry={13}
                fill={unknown ? '#4a3828' : open ? 'url(#podOpen)' : 'url(#podClosed)'}
                stroke="#c4922a"
                strokeWidth="1.5"
              />
              {/* Face mark */}
              {!unknown && open && (
                <line
                  x1={p.x}
                  y1={p.y - 6}
                  x2={p.x}
                  y2={p.y + 6}
                  stroke="#3a2810"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              )}
              {!unknown && !open && (
                <>
                  <line
                    x1={p.x - 5}
                    y1={p.y - 5}
                    x2={p.x - 5}
                    y2={p.y + 5}
                    stroke="#e0b84a"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <line
                    x1={p.x + 5}
                    y1={p.y - 5}
                    x2={p.x + 5}
                    y2={p.y + 5}
                    stroke="#e0b84a"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </>
              )}
              {unknown && (
                <text
                  x={p.x}
                  y={p.y + 4}
                  textAnchor="middle"
                  fill="#a89078"
                  fontSize="12"
                  fontFamily="Cinzel, serif"
                >
                  ?
                </text>
              )}
            </g>
          );
        })}

        {/* Column labels */}
        <text
          x={cx + colGap / 2}
          y={h - 58}
          textAnchor="middle"
          fill="#a89078"
          fontSize="11"
          fontFamily="Source Sans 3, sans-serif"
          letterSpacing="0.12em"
        >
          DER
        </text>
        <text
          x={cx - colGap / 2}
          y={h - 58}
          textAnchor="middle"
          fill="#a89078"
          fontSize="11"
          fontFamily="Source Sans 3, sans-serif"
          letterSpacing="0.12em"
        >
          IZQ
        </text>

        {/* Sign name */}
        <text
          x={cx}
          y={h - 14}
          textAnchor="middle"
          fill="#e0b84a"
          fontSize={compact ? 13 : 15}
          fontFamily="Cinzel, serif"
          fontWeight="600"
        >
          {name}
        </text>
      </svg>
      <figcaption className="opele-caption">
        {throwData ? (
          <>
            <span className="marks-inline">
              {right.join(' ')} <span className="sep">·</span> {left.join(' ')}
            </span>
            <span className="legend">
              I = abierto · II = cerrado
            </span>
          </>
        ) : (
          <span className="legend">Tire el opelé para revelar el signo</span>
        )}
      </figcaption>
    </figure>
  );
}
