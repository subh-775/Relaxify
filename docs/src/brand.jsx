/**
 * Relaxify's look, for the docs: the gold note, the card art, and the cards
 * themselves, all taken from the app (Logo.tsx, brandArt.ts, FeatureCard.tsx)
 * so the site reads as the same product.
 */
import {useEffect, useId, useState} from 'react';
import {FLAT, PAGES, PAL, SITE} from './nav.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** An in-site link, with the GitHub Pages base in front. */
export const href = path => `${BASE}${path}`;

/* ── the gold note (Logo.tsx) ─────────────────────────────────────────────── */

export function Note({size = 28, color}) {
  const id = `note${useId().replace(/:/g, '')}`;
  const fill = color ?? `url(#${id})`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {!color && (
        <defs>
          <linearGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor="#FFF1D6" />
            <stop offset="0.5" stopColor="#E3B878" />
            <stop offset="1" stopColor="#8A5A2B" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M50 14 H58 V70 C58 83 49 90 38 90 C27 90 19 83 19 73 C19 63 28 56 38 56 C43 56 47 57 50 59 Z"
        fill={fill}
      />
      <path d="M63 14 C76 20 86 30 84 46 C83 54 79 60 73 63 C75 52 70 40 63 34 Z" fill={fill} />
      {!color && <path d="M63 14 C70 17 76 22 80 28 C74 26 68 27 63 30 Z" fill="#fff" opacity=".4" />}
      {!color && <path d="M63 34 C70 40 75 52 73 63 C77 52 74 42 66 36 Z" fill="#000" opacity=".3" />}
    </svg>
  );
}

/* ── card art (brandArt.ts shapes) ────────────────────────────────────────── */

function burst(cx, cy, R, r, n) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** The corner artwork a card of palette `p` carries. 170 units square. */
export function Art({kind, p, size = 170}) {
  const s = {
    burst: (
      <>
        <path d={burst(85, 85, 78, 50, 12)} fill={p.a} />
        <circle cx="85" cy="85" r="28" fill={p.b} />
      </>
    ),
    search: (
      <>
        <circle cx="85" cy="85" r="50" fill={p.ink} />
        <circle cx="79" cy="79" r="21" fill="none" stroke={p.bg} strokeWidth="7" />
        <path d="M95 95 l15 15" stroke={p.bg} strokeWidth="8" strokeLinecap="round" />
      </>
    ),
    stack: (
      <>
        <rect x="46" y="46" width="60" height="60" rx="9" fill={p.a} transform="rotate(-12 76 76)" />
        <rect x="62" y="62" width="60" height="60" rx="9" fill={p.b} transform="rotate(8 92 92)" />
      </>
    ),
    dots: (
      <>
        {[0, 1, 2, 3].map(i => (
          <circle key={i} cx="86" cy="84" r={24 + i * 17} fill="none" stroke={p.ink} strokeWidth="3" opacity={0.5 - i * 0.1} />
        ))}
        <circle cx="72" cy="70" r="20" fill={p.a} />
        <circle cx="102" cy="74" r="20" fill={p.b} />
        <circle cx="86" cy="100" r="20" fill={p.c} />
      </>
    ),
    bars: (
      <>
        {[30, 54, 40, 66, 26].map((h, i) => (
          <rect key={i} className="art-bar" x={50 + i * 15} y={112 - h} width="10" height={h} rx="5" fill={p.a} style={{animationDelay: `${i * 0.12}s`}} />
        ))}
      </>
    ),
    ask: (
      <>
        <circle cx="85" cy="85" r="46" fill={p.ink} />
        <text x="85" y="103" fontSize="52" fontWeight="800" textAnchor="middle" fill={p.bg} fontFamily="inherit">
          ?
        </text>
      </>
    ),
  }[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 170 170" aria-hidden="true">
      {s}
    </svg>
  );
}

/* ── the card (FeatureCard.tsx) ───────────────────────────────────────────── */

/** One page as a Home card: kicker, big line, pill, turning artwork. */
export function PageCard({page, as = 'a', style, tabIndex, pill = 'Open'}) {
  const p = PAL[page.pal];
  const Tag = as;
  const props = as === 'a' ? {href: href(page.link)} : {};
  return (
    <Tag
      className="card"
      style={{'--bg': p.bg, '--ink': p.ink, ...style}}
      tabIndex={tabIndex}
      {...props}>
      <span className="card-art spin">
        {page.art === 'note' ? <Note size={120} /> : <Art kind={page.art} p={p} />}
      </span>
      <span className="card-words">
        <span className="card-kicker">{page.title}</span>
        <span className="card-title">{page.card}</span>
      </span>
      <span className="card-pill">{pill}</span>
    </Tag>
  );
}

/* ── home: the stack ──────────────────────────────────────────────────────── */

/**
 * The six pages as a deck, the way the Recap flips: tap the front card's
 * body to send it to the back, its pill to open it. Moves on by itself every
 * few seconds until you touch it; arrow keys work too.
 */
export function Stack() {
  const [top, setTop] = useState(0);
  const [auto, setAuto] = useState(true);
  const n = PAGES.length;
  const next = () => setTop(t => (t + 1) % n);
  const prev = () => setTop(t => (t - 1 + n) % n);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!auto || reduce) {
      return;
    }
    const t = setInterval(next, 3800);
    return () => clearInterval(t);
  }, [auto]);

  const stop = () => setAuto(false);

  return (
    <div
      className="stack"
      onPointerDown={stop}
      onKeyDown={e => {
        if (e.key === 'ArrowRight') {
          stop();
          next();
        } else if (e.key === 'ArrowLeft') {
          stop();
          prev();
        }
      }}>
      <div className="stack-deck">
        {PAGES.map((page, i) => {
          const d = (i - top + n) % n;
          const front = d === 0;
          return (
            <div
              key={page.link}
              className="stack-slot"
              aria-hidden={!front}
              style={{
                '--i': i,
                zIndex: 10 - d,
                opacity: d > 3 ? 0 : 1,
                transform: `translate(${d * 14}px, ${d * 10}px) rotate(${d * 2.6}deg) scale(${1 - d * 0.035})`,
              }}
              onClick={e => {
                // The pill opens the page; anywhere else on the front card
                // flips to the next one.
                if (front && !e.target.closest('.card-pill')) {
                  e.preventDefault();
                  next();
                }
              }}>
              <PageCard page={page} tabIndex={front ? 0 : -1} />
            </div>
          );
        })}
      </div>
      <div className="stack-foot">
        <div className="dots" role="tablist" aria-label="Pages">
          {PAGES.map((page, i) => (
            <button
              key={page.link}
              role="tab"
              aria-selected={i === top}
              aria-label={page.title}
              className={i === top ? 'dot on' : 'dot'}
              style={{'--c': PAL[page.pal].bg}}
              onClick={() => {
                stop();
                setTop(i);
              }}
            />
          ))}
        </div>
        <span className="stack-hint">Tap a card to flip it, or Open to read it</span>
      </div>
    </div>
  );
}

/* ── in-page pieces ───────────────────────────────────────────────────────── */

/** A feature, told on a coloured card instead of in a paragraph. */
export function Banner({pal = 'coral', kicker, title, art, children}) {
  const p = PAL[pal];
  return (
    <section className="banner" style={{'--bg': p.bg, '--ink': p.ink}}>
      {art && (
        <span className="banner-art spin">
          <Art kind={art} p={p} size={150} />
        </span>
      )}
      {kicker && <span className="banner-kicker">{kicker}</span>}
      {title && <h3 className="banner-title">{title}</h3>}
      <div className="banner-body">{children}</div>
    </section>
  );
}

/** Two or three banners side by side on a wide screen, stacked on a phone. */
export function Row({children}) {
  return <div className="row">{children}</div>;
}

/** A titled group on a grey surface, the way the app's Settings groups
 *  its rows: here, a run of folded questions. */
export function Group({title, children}) {
  return (
    <section className="group">
      {title && <h2 className="group-title">{title}</h2>}
      <div className="surface">{children}</div>
    </section>
  );
}

/** A question with its answer folded away, for the small print. */
export function Fold({q, children}) {
  return (
    <details className="fold">
      <summary>{q}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

/** A little numbered path: each step a chip. */
export function Steps({children}) {
  return <ol className="steps">{children}</ol>;
}

/** The big "get the app" button, straight to the newest APK. */
export function GetApp({label = 'Download Relaxify'}) {
  return (
    <a className="get" href={SITE.apk}>
      <Note size={22} />
      {label}
    </a>
  );
}

/* ── the Recap, flippable ─────────────────────────────────────────────────── */

const RECAP = [
  {pal: 'coral', k: 'Your week in music', n: '86', l: 'songs, 5 h 12 min', why: 'Every song you listened to for 30 seconds or more.'},
  {pal: 'lime', k: 'Your top song', n: '14×', l: 'Kesariya', why: 'The song you played most this week.'},
  {pal: 'lav', k: 'You listen most at', n: '11 pm', l: 'Night owl', why: 'The hour you play the most music, and a name for it.'},
  {pal: 'sky', k: 'Your top artist', n: '#1', l: 'Arijit Singh', why: 'Counted across every song an artist is on.'},
  {pal: 'orange', k: 'On a roll', n: '9', l: 'days in a row with music', why: 'Your streak: days in a row with at least one song.'},
];

export function RecapFlip() {
  const [i, setI] = useState(0);
  const n = RECAP.length;
  const card = RECAP[i];
  return (
    <div className="recap">
      <button
        type="button"
        className="recap-deck"
        onClick={() => setI(x => (x + 1) % n)}
        aria-label={`${card.k}: ${card.n} ${card.l}. Next card`}>
        {RECAP.map((c, j) => {
          const d = (j - i + n) % n;
          const p = PAL[c.pal];
          return (
            <span
              key={c.k}
              className="recap-card"
              style={{
                '--bg': p.bg,
                '--ink': p.ink,
                zIndex: 10 - d,
                opacity: d > 2 ? 0 : 1,
                transform: `translateY(${d * 12}px) scale(${1 - d * 0.05})`,
              }}>
              <span className="recap-k">{c.k}</span>
              <span>
                <span className="recap-n">{c.n}</span>
                <span className="recap-l">{c.l}</span>
              </span>
              <span className="recap-tap">
                {j + 1} of {n}, tap for the next
              </span>
            </span>
          );
        })}
      </button>
      <p className="recap-why">{card.why}</p>
    </div>
  );
}

/* ── releases, live from GitHub ───────────────────────────────────────────── */

export function ReleaseBadges() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${SITE.api}/releases?per_page=100`).then(r => (r.ok ? r.json() : null)),
      fetch(SITE.api).then(r => (r.ok ? r.json() : null)),
    ])
      .then(([releases, repo]) => {
        if (!alive) {
          return;
        }
        const all = Array.isArray(releases) ? releases.filter(r => !r.draft) : null;
        setData({
          // The newest REAL release, never a test build.
          tag: all?.find(r => !r.prerelease)?.tag_name ?? null,
          // null, not 0, when GitHub did not answer: a rate-limited read that
          // says "0 downloads" would be a wrong number stated confidently.
          downloads: all
            ? all.reduce((s, r) => s + (r.assets || []).reduce((m, a) => m + (a.download_count || 0), 0), 0)
            : null,
          stars: repo?.stargazers_count ?? null,
        });
      })
      .catch(() => alive && setData({tag: null, downloads: null, stars: null}));
    return () => {
      alive = false;
    };
  }, []);
  const cells = [
    ['Newest', data?.tag ?? '…', 'lime'],
    ['Downloads', data?.downloads != null ? data.downloads.toLocaleString() : '…', 'sky'],
    ['Stars', data?.stars != null ? String(data.stars) : '…', 'pink'],
  ];
  return (
    <div className="badges">
      {cells.map(([label, value, pal]) => (
        <span key={label} className="badge" style={{'--bg': PAL[pal].bg}}>
          <span className="badge-v">{value}</span>
          <span className="badge-l">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** Where a page sits in the reading order, for "next". */
export function nextOf(link) {
  const i = FLAT.findIndex(p => p.link === link);
  return i >= 0 && i < FLAT.length - 1 ? FLAT[i + 1] : null;
}
