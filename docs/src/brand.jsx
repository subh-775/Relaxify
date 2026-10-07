/**
 * The site's own pieces: the logo and its two notes as characters, the
 * Recap-style starburst, the Home deck, the download button, live release
 * numbers, and the blocks pages are written with.
 *
 * Motion is GSAP, transform and opacity only, and none of it runs for anyone
 * whose phone asks for less motion.
 */
import {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import gsap from 'gsap';
import {CYCLE, PAGES, PAL, SITE} from './nav.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** An in-site link, with the GitHub Pages base in front. */
export const href = path => `${BASE}${path}`;

export const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── the mark, and the mark alive ────────────────────────────────────────── */

const NOTE =
  'M52 16 C52 13 55 12 57 13 C72 20 84 32 82 50 C81 58 77 63 72 66 C75 55 72 42 60 36 L60 70 C60 82 50 90 38 90 C27 90 19 83 19 74 C19 64 28 57 39 57 C44 57 48 58 52 61 Z';
const SHINE = 'M52 16 C52 13 55 12 57 13 C66 17 73 23 77 30 C70 26 62 24 56 26 L52 28 Z';
const BACK = 'translate(-6.96 -3.78) scale(0.7022)';
const FRONT = 'translate(4.89 -2.03) scale(1.0721)';

function Grads({id}) {
  return (
    <defs>
      <linearGradient id={`${id}b`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#C0606C" />
        <stop offset="0.5" stopColor="#A12C48" />
        <stop offset="1" stopColor="#6E1030" />
      </linearGradient>
      <linearGradient id={`${id}f`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor="#FF9AA0" />
        <stop offset="0.5" stopColor="#FF5A6E" />
        <stop offset="1" stopColor="#E2266A" />
      </linearGradient>
    </defs>
  );
}

/** The logo: two notes, no faces. */
export function Logo({size = 28}) {
  const id = `l${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <Grads id={id} />
      <path d={NOTE} transform={BACK} fill={`url(#${id}b)`} />
      <path d={NOTE} transform={FRONT} fill={`url(#${id}f)`} />
    </svg>
  );
}

/** Eyes and a mouth on a note's round head (cx, cy), scaled by s. */
function Face({cx, cy, s, mood}) {
  const look = mood === 'huh' ? [-1, -1.2] : [0.8, 0.6];
  const eye = x => (
    <g className="eye" transform={`translate(${x} ${cy - 2 * s}) scale(${s})`}>
      <ellipse rx="3.4" ry="4.2" fill="#fff" />
      <circle cx={look[0]} cy={look[1]} r="1.9" fill="#111014" />
    </g>
  );
  return (
    <>
      {eye(cx - 6.5 * s)}
      {eye(cx + 6.5 * s)}
      <path
        d={mood === 'huh' ? 'M-3 5 Q0 3 3 5' : 'M-3.5 3.5 Q0 7 3.5 3.5'}
        transform={`translate(${cx} ${cy + 5 * s}) scale(${s})`}
        stroke="#111014"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

/**
 * The two notes as characters. `mood`: dance (Home), wave (Get the app),
 * huh (Help), vibe (the rest: a gentle bob).
 */
export function Mascot({mood = 'vibe', size = 120, className = ''}) {
  const id = `m${useId().replace(/:/g, '')}`;
  const ref = useRef(null);
  useEffect(() => {
    if (reduceMotion()) {
      return;
    }
    const ctx = gsap.context(() => {
      const nb = ref.current.querySelector('.nb');
      const nf = ref.current.querySelector('.nf');
      gsap.set([nb, nf], {transformOrigin: '50% 90%'});
      if (mood === 'dance') {
        gsap.to(nf, {rotation: 8, y: -3, duration: 0.42, yoyo: true, repeat: -1, ease: 'sine.inOut'});
        gsap.to(nb, {rotation: -10, y: -4, duration: 0.42, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 0.21});
      } else if (mood === 'wave') {
        gsap.to(nf, {rotation: 12, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut'});
        gsap.to(nb, {y: -5, duration: 0.7, yoyo: true, repeat: -1, ease: 'sine.inOut'});
      } else if (mood === 'huh') {
        gsap.to(ref.current, {rotation: -6, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut', transformOrigin: '50% 80%'});
      } else {
        gsap.to([nf, nb], {y: -3, duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut', stagger: 0.3});
      }
      // A blink now and then.
      const eyes = ref.current.querySelectorAll('.eye');
      const blink = () => {
        gsap.to(eyes, {scaleY: 0.1, duration: 0.08, yoyo: true, repeat: 1, transformOrigin: 'center'});
        gsap.delayedCall(2 + Math.random() * 3, blink);
      };
      gsap.delayedCall(1.5, blink);
    }, ref);
    return () => ctx.revert();
  }, [mood]);
  return (
    <svg ref={ref} className={`mascot ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <Grads id={id} />
      <g className="nb">
        <g transform={BACK}>
          <path d={NOTE} fill={`url(#${id}b)`} />
          <path d={SHINE} fill="#fff" opacity=".3" />
        </g>
        <Face cx={20.4} cy={48.2} s={0.62} mood={mood} />
      </g>
      <g className="nf">
        <g transform={FRONT}>
          <path d={NOTE} fill={`url(#${id}f)`} />
          <path d={SHINE} fill="#fff" opacity=".3" />
        </g>
        <Face cx={46.7} cy={77.3} s={1} mood={mood} />
      </g>
      {mood === 'huh' && (
        <text x="80" y="26" fontSize="22" fontWeight="800" fill="#111014" fontFamily="inherit">
          ?
        </text>
      )}
    </svg>
  );
}

/* ── the Recap starburst ─────────────────────────────────────────────────── */

function burstPath(R, r, n) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(50 + Math.cos(a) * rad).toFixed(1)} ${(50 + Math.sin(a) * rad).toFixed(1)}`;
  }
  return `${d}Z`;
}

export function Burst({color, className = '', points = 12, spin}) {
  const ref = useRef(null);
  useEffect(() => {
    if (!spin || reduceMotion()) {
      return;
    }
    const t = gsap.to(ref.current, {rotation: 360, duration: 24, repeat: -1, ease: 'none', transformOrigin: '50% 50%'});
    return () => t.kill();
  }, [spin]);
  return (
    <svg ref={ref} className={`burst ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <path d={burstPath(48, 29, points)} fill={color} />
    </svg>
  );
}

/* ── live release numbers, read once per visit ───────────────────────────── */

let releases = null;
function readReleases() {
  releases =
    releases ||
    fetch(`${SITE.api}/releases?per_page=100`)
      .then(r => (r.ok ? r.json() : null))
      .then(all => {
        if (!Array.isArray(all)) {
          return null;
        }
        // Real releases only: test builds (pre-releases) are not "Relaxify".
        const real = all.filter(r => !r.draft && !r.prerelease);
        const latest = real[0];
        if (!latest) {
          return null;
        }
        const apk = (latest.assets || []).find(a => a.name === 'Relaxify.apk');
        return {
          version: latest.tag_name.replace(/^v/, ''),
          date: new Date(latest.published_at).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}),
          size: apk ? `${Math.round(apk.size / 1048576)} MB` : null,
          url: latest.html_url,
          downloads: real.reduce(
            (sum, r) => sum + (r.assets || []).filter(a => a.name.endsWith('.apk')).reduce((s, a) => s + (a.download_count || 0), 0),
            0,
          ),
        };
      })
      .catch(() => null);
  return releases;
}

export function useReleases() {
  const [info, setInfo] = useState(undefined);
  useEffect(() => {
    let alive = true;
    readReleases().then(x => alive && setInfo(x));
    return () => {
      alive = false;
    };
  }, []);
  return info; // undefined: asking; null: GitHub didn't answer
}

/** A number that counts up once it arrives. */
function CountUp({value}) {
  const ref = useRef(null);
  useEffect(() => {
    if (value == null) {
      return;
    }
    if (reduceMotion()) {
      ref.current.textContent = value.toLocaleString('en-IN');
      return;
    }
    const o = {v: 0};
    const t = gsap.to(o, {
      v: value,
      duration: 1.4,
      ease: 'power2.out',
      onUpdate: () => ref.current && (ref.current.textContent = Math.round(o.v).toLocaleString('en-IN')),
    });
    return () => t.kill();
  }, [value]);
  return <span ref={ref}>{value == null ? '…' : '0'}</span>;
}

/** What's new: the newest version, when it came out, and every download. */
export function LiveRelease() {
  const info = useReleases();
  if (info === null) {
    return (
      <p>
        GitHub didn't answer just now, so the numbers can't show. The{' '}
        <a href={SITE.allReleases} target="_blank" rel="noreferrer">
          full list of versions
        </a>{' '}
        is always on GitHub.
      </p>
    );
  }
  return (
    <>
      <div className="live">
        <div className="stat wide" style={{background: PAL.lime.bg}}>
          <span>
            <span className="l">Newest version</span>
            <span className="v">{info ? info.version : '…'}</span>
          </span>
          <a className="pill-dark" href={SITE.apk}>
            Download
          </a>
        </div>
        <div className="stat" style={{background: PAL.sky.bg}}>
          <span className="v small">{info ? info.date : '…'}</span>
          <span className="l">Released</span>
        </div>
        <div className="stat" style={{background: PAL.orange.bg}}>
          <span className="v">
            <CountUp value={info ? info.downloads : null} />
          </span>
          <span className="l">Downloads, all versions</span>
        </div>
      </div>
      <p className="livebadge">
        <i aria-hidden="true" />
        Live from GitHub, every time you open this page
      </p>
      {info && (
        <p>
          <a href={info.url} target="_blank" rel="noreferrer">
            See everything that changed in {info.version}
          </a>
        </p>
      )}
    </>
  );
}

/** The download button. Always the newest version, straight from GitHub. */
export function GetApp({label = 'Download', meta = true}) {
  const info = useReleases();
  return (
    <span className="get-wrap">
      <a className="get" href={SITE.apk}>
        <DownloadIcon />
        {label}
      </a>
      {meta && (
        <span className="get-meta">
          {info ? `Version ${info.version}${info.size ? `, ${info.size}` : ''}, the newest` : 'Always the newest version'}
        </span>
      )}
    </span>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
    </svg>
  );
}

/* ── the Home deck ───────────────────────────────────────────────────────── */

/** The pages as a stack of Recap cards: drag the top one away to see the
 *  next, tap Open to read it. Arrow keys work too. */
export function Deck() {
  const cards = PAGES.filter(p => p.link !== '/releases');
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const els = useRef([]);
  const deck = useRef(null);
  const drag = useRef({on: false, x: 0, dx: 0});

  const layout = (o, animate) => {
    o.forEach((idx, pos) => {
      const props = {
        x: 0,
        y: pos * 10,
        scale: 1 - pos * 0.05,
        rotation: pos ? (pos % 2 ? 3 : -3) : 0,
        zIndex: 10 - pos,
        autoAlpha: pos > 2 ? 0 : 1,
      };
      if (animate && !reduceMotion()) {
        gsap.to(els.current[idx], {...props, duration: 0.45, ease: 'back.out(1.6)'});
      } else {
        gsap.set(els.current[idx], props);
      }
    });
  };

  useLayoutEffect(() => {
    layout(order, false);
    if (!reduceMotion()) {
      gsap.from(els.current, {y: 120, rotation: 12, autoAlpha: 0, stagger: 0.07, duration: 0.7, ease: 'back.out(1.4)', delay: 0.4});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const turn = dir => {
    const top = els.current[order[0]];
    const next = dir < 0 ? [...order.slice(1), order[0]] : [order[order.length - 1], ...order.slice(0, -1)];
    gsap.to(top, {
      x: dir * 420,
      rotation: dir * 24,
      duration: reduceMotion() ? 0 : 0.3,
      ease: 'power2.in',
      onComplete: () => {
        gsap.set(top, {x: 0});
        setOrder(next);
        layout(next, true);
      },
    });
  };

  const down = e => {
    if (e.target.closest('a')) {
      return;
    }
    drag.current = {on: true, x: e.clientX, dx: 0};
    deck.current.setPointerCapture(e.pointerId);
  };
  const move = e => {
    if (!drag.current.on) {
      return;
    }
    drag.current.dx = e.clientX - drag.current.x;
    gsap.set(els.current[order[0]], {x: drag.current.dx, rotation: drag.current.dx / 14});
  };
  const up = () => {
    if (!drag.current.on) {
      return;
    }
    drag.current.on = false;
    const {dx} = drag.current;
    if (Math.abs(dx) > deck.current.clientWidth / 3) {
      turn(Math.sign(dx));
    } else {
      gsap.to(els.current[order[0]], {x: 0, rotation: 0, duration: 0.4, ease: 'back.out(2)'});
    }
  };

  return (
    <div className="deck-wrap">
      <div
        ref={deck}
        className="deck"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        tabIndex={0}
        role="group"
        aria-label="Pages. Drag the cards, or use the arrow keys."
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') turn(-1);
          if (e.key === 'ArrowRight') turn(1);
        }}>
        {cards.map((p, i) => (
          <div
            key={p.link}
            ref={el => (els.current[i] = el)}
            className="card"
            style={{background: PAL[p.pal].bg, color: PAL[p.pal].ink}}
            aria-hidden={order[0] !== i}>
            <Burst color={PAL[p.pal].art} className="card-art" points={10} />
            <span className="k">{p.kicker}</span>
            <h3>{p.title}</h3>
            <p>{p.card}</p>
            <a className="pill-dark" href={href(p.link)} tabIndex={order[0] === i ? 0 : -1}>
              Open
            </a>
          </div>
        ))}
      </div>
      <div className="dots" aria-hidden="true">
        {cards.map((p, i) => (
          <i key={p.link} className={order[0] === i ? 'on' : ''} />
        ))}
      </div>
      <p className="hint">Swipe the cards 👆</p>
    </div>
  );
}

/* ── page blocks ─────────────────────────────────────────────────────────── */

/** A real sequence: numbered, each step its own colour. */
export function Steps({children}) {
  return <ol className="steps">{children}</ol>;
}

/** "Do this → this happens" cards, each its own colour. */
export function Moves({children}) {
  return <div className="moves">{children}</div>;
}

export function Move({how, emoji, children}) {
  return (
    <div className="move reveal">
      {emoji && (
        <span className="g" aria-hidden="true">
          {emoji}
        </span>
      )}
      <span>
        <b>{how}</b>
        <span>{children}</span>
      </span>
    </div>
  );
}

/** A note set apart: a tip, or something important. */
export function Callout({kind = 'tip', title, children}) {
  return (
    <aside className={`callout ${kind} reveal`}>
      <b>{title || (kind === 'important' ? 'Heads up' : 'Pro tip')}</b>
      <div>{children}</div>
    </aside>
  );
}

/** A question that opens to its answer. */
export function Fold({q, children}) {
  return (
    <details className="fold reveal">
      <summary>{q}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function Group({title, children}) {
  return (
    <section className="group">
      <h2 className="reveal">{title}</h2>
      <div className="folds">{children}</div>
    </section>
  );
}

/** Colour for the n-th step or card, cycling the palette. */
export const cycle = n => PAL[CYCLE[n % CYCLE.length]].bg;

/* ── reveal on scroll ────────────────────────────────────────────────────── */

/**
 * Inside `root`, everything marked .reveal (and the prose's headings,
 * paragraphs and lists) slides in: what is already on screen right away,
 * the rest as it scrolls into view. Nothing is ever left hidden waiting.
 */
export function useReveal(root, key) {
  useEffect(() => {
    const el = root.current;
    if (!el || reduceMotion()) {
      return;
    }
    const items = [...el.querySelectorAll('.reveal, .prose > h2, .prose > h3, .prose > p, .prose > ul, .prose > ol')];
    const fold = window.innerHeight;
    const now = [];
    const later = [];
    items.forEach(it => (it.getBoundingClientRect().top < fold ? now : later).push(it));
    const ctx = gsap.context(() => {
      if (now.length) {
        gsap.fromTo(now, {y: 24, autoAlpha: 0}, {y: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out', stagger: 0.05, delay: 0.1});
      }
      gsap.set(later, {autoAlpha: 0});
    }, el);
    const io = new IntersectionObserver(
      entries =>
        entries.forEach(en => {
          if (en.isIntersecting) {
            io.unobserve(en.target);
            gsap.fromTo(en.target, {y: 24, autoAlpha: 0}, {y: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out'});
          }
        }),
      {threshold: 0.12},
    );
    later.forEach(it => io.observe(it));
    return () => {
      io.disconnect();
      ctx.revert();
    };
  }, [root, key]);
}
