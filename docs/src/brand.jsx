/**
 * The site's own pieces: the Relaxify mark, the download button, and the few
 * blocks the pages are written with (steps, questions, notes, gesture lists).
 * One colour, the app's coral; everything else is light on dark.
 */
import {useEffect, useId, useState} from 'react';
import {FLAT, SITE} from './nav.js';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
/** An in-site link, with the GitHub Pages base in front. */
export const href = path => `${BASE}${path}`;

/* ── the mark: two notes (Logo.tsx in the app) ───────────────────────────── */

const NOTE =
  'M52 16 C52 13 55 12 57 13 C72 20 84 32 82 50 C81 58 77 63 72 66 C75 55 72 42 60 36 L60 70 C60 82 50 90 38 90 C27 90 19 83 19 74 C19 64 28 57 39 57 C44 57 48 58 52 61 Z';
const SHINE = 'M52 16 C52 13 55 12 57 13 C66 17 73 23 77 30 C70 26 62 24 56 26 L52 28 Z';
const BACK = 'translate(-6.96 -3.78) scale(0.7022)';
const FRONT = 'translate(4.89 -2.03) scale(1.0721)';

export function Note({size = 28}) {
  const id = `note${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
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
      <g transform={BACK}>
        <path d={NOTE} fill={`url(#${id}b)`} />
        <path d={SHINE} fill="#fff" opacity=".3" />
      </g>
      <g transform={FRONT}>
        <path d={NOTE} fill={`url(#${id}f)`} />
        <path d={SHINE} fill="#fff" opacity=".3" />
      </g>
    </svg>
  );
}

/* ── the newest release, read once per visit ─────────────────────────────── */

let latest = null;
function readLatest() {
  latest =
    latest ||
    fetch(`${SITE.api}/releases/latest`)
      .then(r => (r.ok ? r.json() : null))
      .then(r => {
        if (!r) {
          return null;
        }
        const apk = (r.assets || []).find(a => a.name === 'Relaxify.apk');
        return {
          version: r.tag_name,
          date: new Date(r.published_at).toLocaleDateString('en-IN', {day: 'numeric', month: 'long', year: 'numeric'}),
          size: apk ? `${Math.round(apk.size / 1048576)} MB` : null,
          url: r.html_url,
        };
      })
      .catch(() => null);
  return latest;
}

export function useLatest() {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    let alive = true;
    readLatest().then(x => alive && setInfo(x));
    return () => {
      alive = false;
    };
  }, []);
  return info;
}

/** The download button. Always the newest version, straight from GitHub. */
export function GetApp({label = 'Download for Android', small}) {
  const info = useLatest();
  return (
    <span className={small ? 'get-wrap small' : 'get-wrap'}>
      <a className="get" href={SITE.apk}>
        {label}
      </a>
      {!small && (
        <span className="get-meta">
          {info ? `Version ${info.version.replace(/^v/, '')}${info.size ? `, ${info.size}` : ''}` : 'The newest version'}
        </span>
      )}
    </span>
  );
}

/** The newest release, for the What's new page. */
export function ReleaseInfo() {
  const info = useLatest();
  return (
    <div className="release">
      <div>
        <span className="release-label">Newest version</span>
        <span className="release-version">{info ? info.version.replace(/^v/, '') : '…'}</span>
        <span className="release-date">{info ? `Released ${info.date}` : 'Asking GitHub…'}</span>
      </div>
      <GetApp label="Download it" small />
    </div>
  );
}

/* ── page blocks ─────────────────────────────────────────────────────────── */

/** A real sequence: numbered. */
export function Steps({children}) {
  return <ol className="steps">{children}</ol>;
}

/** A question that opens to its answer. */
export function Fold({q, children}) {
  return (
    <details className="fold">
      <summary>{q}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}

export function Group({title, children}) {
  return (
    <section className="group">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** A note set apart from the text: a tip, or something important. */
export function Callout({kind = 'tip', title, children}) {
  return (
    <aside className={`callout ${kind}`}>
      <b>{title || (kind === 'important' ? 'Important' : 'Tip')}</b>
      <div>{children}</div>
    </aside>
  );
}

/** "Do this → this happens" pairs, as a list: gestures, menu items. */
export function Moves({children}) {
  return <dl className="moves">{children}</dl>;
}

export function Move({how, children}) {
  return (
    <div className="move">
      <dt>{how}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* ── the hero's moving part ──────────────────────────────────────────────── */

/** Seven bars rising and falling like a song playing. Still, for anyone who
 *  asked their phone for less motion. */
export function Playing() {
  return (
    <span className="playing" aria-hidden="true">
      {Array.from({length: 7}, (_, i) => (
        <i key={i} style={{'--d': `${(i * 137) % 900}ms`, '--h': `${40 + ((i * 53) % 60)}%`}} />
      ))}
    </span>
  );
}

/* ── reading order ───────────────────────────────────────────────────────── */

export function nextOf(link) {
  const i = FLAT.findIndex(p => p.link === link);
  return i >= 0 && i < FLAT.length - 1 ? FLAT[i + 1] : null;
}

export function prevOf(link) {
  const i = FLAT.findIndex(p => p.link === link);
  return i > 0 ? FLAT[i - 1] : null;
}
