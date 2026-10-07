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

/** Every release, a page of 100 at a time (GitHub's limit per request).
 *  null when GitHub doesn't answer. */
async function allReleases() {
  const out = [];
  for (let page = 1; page < 20; page++) {
    const r = await fetch(`${SITE.api}/releases?per_page=100&page=${page}`);
    if (!r.ok) {
      return out.length ? out : null;
    }
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 100) {
      break;
    }
  }
  return out;
}

let releases = null;
function readReleases() {
  releases =
    releases ||
    allReleases()
      .then(all => {
        if (!Array.isArray(all)) {
          return null;
        }
        const published = all.filter(r => !r.draft);
        // The newest version people get: never a test build.
        const latest = published.find(r => !r.prerelease);
        if (!latest) {
          return null;
        }
        const apk = (latest.assets || []).find(a => a.name === 'Relaxify.apk');
        return {
          version: latest.tag_name.replace(/^v/, ''),
          date: new Date(latest.published_at).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'}),
          size: apk ? `${Math.round(apk.size / 1048576)} MB` : null,
          url: latest.html_url,
          // Every file of every release, the same count as the README's
          // Downloads badge (shields.io github/downloads/total), so the two
          // never disagree.
          downloads: published.reduce((sum, r) => sum + (r.assets || []).reduce((s, a) => s + (a.download_count || 0), 0), 0),
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
      {meta && info && (
        <span className="get-meta">{`Version ${info.version}${info.size ? `, ${info.size}` : ''}`}</span>
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

/** The pages as a stack of Recap cards. Tap the top card (or swipe it) for
 *  the next one, swipe the other way to go back, Open to read it. Arrow keys,
 *  Enter and Space work too. */
export function Deck() {
  const cards = PAGES.filter(p => p.link !== '/releases');
  const [order, setOrder] = useState(() => cards.map((_, i) => i));
  const els = useRef([]);
  const deck = useRef(null);
  const drag = useRef({on: false, x: 0, dx: 0});
  const busy = useRef(false);
  const last = cards.length - 1;

  // A card's place in the stack: straight, a little lower and smaller the
  // further back. No tilt, so nothing swings as cards move up a place.
  const at = pos => ({
    x: 0,
    y: pos * 12,
    scale: 1 - pos * 0.05,
    rotation: 0,
    zIndex: 10 - pos,
    autoAlpha: pos > 2 ? 0 : 1,
  });
  const glide = {duration: 0.42, ease: 'power3.out', overwrite: 'auto'};

  // In a context, and reverted on cleanup: React runs this twice in
  // development, and a second deal-in that starts from the first one's
  // half-way state leaves the cards stuck see-through and overlapping.
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      if (reduceMotion()) {
        order.forEach((idx, pos) => gsap.set(els.current[idx], at(pos)));
        return;
      }
      // Each card from below to its exact place: fromTo, so a second run can
      // never end see-through (see Home's headline).
      order.forEach((idx, pos) =>
        gsap.fromTo(
          els.current[idx],
          {...at(pos), y: at(pos).y + 80, autoAlpha: 0},
          {...at(pos), duration: 0.6, ease: 'power3.out', delay: 0.3 + pos * 0.06},
        ),
      );
    }, deck);
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** -1: the top card leaves and the next comes up. +1: the last card
   *  comes back on top. One movement: the leaving card and the rest of the
   *  stack move at the same time. */
  const turn = dir => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    const quick = reduceMotion();
    const w = deck.current.clientWidth;
    const next = dir < 0 ? [...order.slice(1), order[0]] : [order[last], ...order.slice(0, -1)];
    const done = () => {
      busy.current = false;
      setOrder(next);
    };
    if (dir < 0) {
      const top = els.current[order[0]];
      gsap.to(top, {
        x: -w * 1.15,
        rotation: -8,
        autoAlpha: 0,
        duration: quick ? 0 : 0.34,
        ease: 'power2.in',
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(top, at(last)); // quietly back at the bottom of the stack
          done();
        },
      });
      next.slice(0, -1).forEach((idx, pos) => gsap.to(els.current[idx], {...at(pos), ...glide, duration: quick ? 0 : glide.duration}));
    } else {
      const back = els.current[order[last]];
      gsap.set(back, {x: w * 1.15, y: 0, scale: 1, rotation: 8, zIndex: 11, autoAlpha: 0});
      gsap.to(back, {...at(0), zIndex: 11, ...glide, duration: quick ? 0 : glide.duration, onComplete: () => {
        gsap.set(back, {zIndex: 10});
        done();
      }});
      next.slice(1).forEach((idx, i) => gsap.to(els.current[idx], {...at(i + 1), ...glide, duration: quick ? 0 : glide.duration}));
    }
  };

  const down = e => {
    if (e.target.closest('a') || busy.current) {
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
    gsap.set(els.current[order[0]], {x: drag.current.dx, rotation: drag.current.dx / 20});
  };
  const up = () => {
    if (!drag.current.on) {
      return;
    }
    drag.current.on = false;
    const {dx} = drag.current;
    if (Math.abs(dx) < 6) {
      turn(-1); // a tap: the next card
    } else if (Math.abs(dx) > deck.current.clientWidth / 4) {
      turn(dx < 0 ? -1 : 1);
    } else {
      gsap.to(els.current[order[0]], {x: 0, rotation: 0, duration: 0.35, ease: 'power3.out'});
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
        aria-label="Pages. Tap or swipe the cards, or use the arrow keys."
        onKeyDown={e => {
          // Enter and Space only on the deck itself: on Open they open.
          if (e.key === 'ArrowLeft' || (e.target === deck.current && (e.key === 'Enter' || e.key === ' '))) {
            e.preventDefault();
            turn(-1);
          }
          if (e.key === 'ArrowRight') {
            turn(1);
          }
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
      <p className="hint">Tap or swipe the cards</p>
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

export function Move({how, children}) {
  return (
    <div className="move reveal">
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
      <b>{title || (kind === 'important' ? 'Heads up' : 'Tip')}</b>
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
