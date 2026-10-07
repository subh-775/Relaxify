/**
 * The shell: routing, the bottom bar (Menu + Download, where a thumb is),
 * the menu sheet, Home, and each page's frame.
 *
 * Phone first: one column, the bar at the bottom in portrait and landscape.
 * A small path router rather than a library: the routes are a fixed list
 * known at build time (nav.js), and the build writes a real HTML file for each.
 */
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import gsap from 'gsap';
import {GET_PAGE, MOVED, PAGES, PAL, SITE} from './nav.js';
import {Burst, Callout, Deck, DownloadIcon, Logo, Mascot, href, reduceMotion, useReveal} from './brand.jsx';
import {mdxComponents} from './mdx.jsx';
import {Github} from './icons.jsx';
import '@fontsource-variable/plus-jakarta-sans';
import './styles.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const CONTENT = import.meta.glob('../content/*.mdx', {eager: true});
const BY_ROUTE = Object.fromEntries(
  Object.entries(CONTENT).map(([file, mod]) => [file.replace('../content', '').replace(/\.mdx$/, ''), mod]),
);

/* ── routing ─────────────────────────────────────────────────────────────── */

const toPath = pathname => {
  const p = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return p.replace(/\/$/, '') || '/';
};

/** Pages that live outside this app (public/get, public/p) load for real. */
const ownPage = pathname => ['/get', '/p'].includes(toPath(pathname));

function useRouter() {
  const [path, setPath] = useState(() => toPath(window.location.pathname));

  const navigate = useCallback(to => {
    const [p, hash] = to.split('#');
    const clean = p.replace(/\/$/, '') || '/';
    const url = `${BASE}${clean === '/' ? '/' : clean}${hash ? `#${hash}` : ''}`;
    if (window.location.pathname + window.location.hash !== url) {
      window.history.pushState({}, '', url);
    }
    setPath(clean);
    requestAnimationFrame(() => {
      const el = hash && document.getElementById(hash);
      if (el) {
        el.scrollIntoView({behavior: 'smooth'});
      } else {
        window.scrollTo({top: 0, left: 0, behavior: 'instant'});
      }
    });
  }, []);

  // An old address: swap it for the new one in place, so Back skips it.
  useEffect(() => {
    const moved = MOVED[path];
    if (moved) {
      window.history.replaceState({}, '', `${BASE}${moved}`);
      setPath(moved);
    }
  }, [path]);

  useEffect(() => {
    const onPop = () => setPath(toPath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    // One delegated listener: MDX links are plain <a>, and routing them here
    // means the content never has to know it lives in an app.
    const onClick = e => {
      const a = e.target.closest?.('a');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') {
        return;
      }
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE || '/') || ownPage(url.pathname)) {
        return;
      }
      e.preventDefault();
      navigate(toPath(url.pathname) + (url.hash || ''));
    };
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('click', onClick);
    };
  }, [navigate]);

  return path;
}

/* ── the bottom bar and the menu ─────────────────────────────────────────── */

function BottomBar({onMenu, open}) {
  return (
    <nav className="bottom" aria-label="Menu and download">
      <button type="button" className="menu-btn" onClick={onMenu} aria-expanded={open} aria-controls="menu">
        <i aria-hidden="true">
          <b />
          <b />
          <b />
        </i>
        Menu
      </button>
      <a className="dl" href={SITE.apk}>
        <DownloadIcon />
        Download
      </a>
    </nav>
  );
}

function Menu({open, onClose, path}) {
  const sheet = useRef(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    sheet.current?.focus();
    if (!reduceMotion()) {
      gsap.fromTo(sheet.current.querySelectorAll('a'), {x: -18, autoAlpha: 0}, {x: 0, autoAlpha: 1, stagger: 0.03, duration: 0.3, delay: 0.08});
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  const item = (link, label, line, color, external) => (
    <a
      key={link}
      href={external ? link : href(link)}
      className={path === link ? 'on' : ''}
      aria-current={path === link ? 'page' : undefined}
      {...(external ? {target: '_blank', rel: 'noreferrer'} : {})}>
      <i style={{background: color}} aria-hidden="true" />
      <span>
        {label}
        <small>{line}</small>
      </span>
    </a>
  );
  return (
    <>
      <div className={open ? 'scrim on' : 'scrim'} onClick={onClose} aria-hidden="true" />
      <div id="menu" ref={sheet} tabIndex={-1} className={open ? 'sheet on' : 'sheet'} role="dialog" aria-label="Menu" inert={open ? undefined : ''}>
        <div className="grab" aria-hidden="true" />
        {item('/', 'Home', 'Back to the start', '#FF5A6E')}
        {item(GET_PAGE, 'Get the app', 'Install in a minute', PAL.coral.bg)}
        {PAGES.map(p => item(p.link, p.title, p.kicker, PAL[p.pal].bg))}
        {item(SITE.repo, 'Relaxify on GitHub', 'Free and open source', '#2a2427', true)}
      </div>
    </>
  );
}

/* ── home ────────────────────────────────────────────────────────────────── */

/** A small line icon on a palette-coloured tile. */
function Glyph({color, d}) {
  return (
    <span className="glyph" style={{background: color}} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#111014" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

function Home() {
  const h = useRef(null);
  useLayoutEffect(() => {
    if (reduceMotion()) {
      return;
    }
    const ctx = gsap.context(() => {
      // fromTo, never from: a from() started twice (React does that in
      // development) takes the first run's half-way state as its end, and
      // the words stay faded for good. Both ends spelled out cannot.
      gsap.fromTo(
        '.w',
        {y: 40, rotation: 6, autoAlpha: 0},
        {y: 0, rotation: 0, autoAlpha: 1, stagger: 0.08, duration: 0.6, ease: 'back.out(1.8)', delay: 0.15},
      );
    }, h);
    return () => ctx.revert();
  }, []);
  const words = 'Music that just plays.'.split(' ');
  return (
    <div className="home">
      <div className="home-grid">
        <section className="hero">
          <Mascot mood="dance" size={124} />
          <h1 ref={h} aria-label="Music that just plays.">
            {words.map((w, i) => (
              <span key={i} className="w" aria-hidden="true">
                {w}{' '}
              </span>
            ))}
          </h1>
          <p className="lede">Free on Android. Search once, tap play, vibes on repeat. No account, no ads.</p>
        </section>
        <Deck />
      </div>

      <section className="quick">
        <h2 className="reveal">Quick ones</h2>
        <div className="stick reveal">
          <Glyph color={PAL.lime.bg} d="M13 2 4 14h7l-1 8 9-12h-7z" />
          <span>
            <b>Installs in a minute</b>
            It's not on the Play Store, so you install the file yourself. <a href={href(GET_PAGE)}>Show me</a>
          </span>
        </div>
        <div className="stick reveal">
          <Glyph color={PAL.sky.bg} d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" />
          <span>
            <b>Updates in the app</b>
            When a new update appears, you'll be notified in the app.
          </span>
        </div>
        <div className="stick reveal">
          <Glyph color={PAL.orange.bg} d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z" />
          <span>
            <b>Free, for real</b>
            No account, no ads, no paywall.
          </span>
        </div>
        <Callout kind="important" title="Never uninstall to update">
          That wipes your playlists and likes for good. Always update from inside the app.
        </Callout>
      </section>
    </div>
  );
}

/* ── a page ──────────────────────────────────────────────────────────────── */

function Page({route, page}) {
  const Content = BY_ROUTE[route].default;
  const p = PAL[page.pal];
  const i = PAGES.indexOf(page);
  const next = PAGES[i + 1];
  const head = useRef(null);
  useLayoutEffect(() => {
    if (reduceMotion()) {
      return;
    }
    const t = gsap.fromTo(head.current, {y: 30, autoAlpha: 0, scale: 0.97}, {y: 0, autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.5)'});
    return () => t.kill();
  }, [route]);
  return (
    <div className="page">
      <header ref={head} className="phead" style={{background: p.bg, color: p.ink}}>
        {page.mood ? <Mascot mood={page.mood} size={136} className="phead-art mascot-art" /> : <Burst color={p.art} className="phead-art" spin />}
        <span className="k">{page.kicker}</span>
        <h1>{page.title}</h1>
      </header>

      <article className="prose">
        <Content components={mdxComponents} />
      </article>

      {next && (
        <a className="next reveal" href={href(next.link)} style={{background: PAL[next.pal].bg, color: PAL[next.pal].ink}}>
          <span>
            <small>Next up</small>
            {next.title}
          </span>
          <span aria-hidden="true" className="next-arrow">
            ›
          </span>
        </a>
      )}

      <p className="edit">
        Something wrong or missing here?{' '}
        <a href={`${SITE.editBase}${route}.mdx`} target="_blank" rel="noreferrer">
          Suggest a change
        </a>
        .
      </p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <header className="phead" style={{background: PAL.pink.bg, color: PAL.pink.ink}}>
        <Mascot mood="huh" size={136} className="phead-art mascot-art" />
        <span className="k">Hmm, lost?</span>
        <h1>Nothing here</h1>
      </header>
      <div className="prose">
        <p>
          This page moved or never existed. <a href={href('/')}>Go back home</a> and pick a card.
        </p>
      </div>
    </div>
  );
}

/* ── the app ─────────────────────────────────────────────────────────────── */

export default function App() {
  const path = useRouter();
  const page = PAGES.find(p => p.link === path);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const main = useRef(null);

  // A new page closes the menu behind it.
  useEffect(close, [path, close]);
  useReveal(main, path);

  useEffect(() => {
    document.title = page ? `${page.title}: Relaxify` : 'Relaxify: music that just plays';
  }, [page]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to the page
      </a>
      <header className="top">
        <a className="brand" href={href('/')}>
          <Logo size={26} />
          Relaxify
        </a>
      </header>
      <main id="main" ref={main} key={path}>
        {path === '/' ? <Home /> : page && BY_ROUTE[path] ? <Page route={path} page={page} /> : MOVED[path] ? null : <NotFound />}
        <footer className="foot">
          <span>Relaxify is free and open source. It doesn't host any music: songs come from JioSaavn, SoundCloud and YouTube.</span>
          <span className="foot-links">
            <a href={SITE.repo} target="_blank" rel="noreferrer">
              <Github size={14} /> GitHub
            </a>
            <a href={SITE.issues} target="_blank" rel="noreferrer">
              Report a problem
            </a>
          </span>
        </footer>
      </main>
      <BottomBar onMenu={() => setOpen(true)} open={open} />
      <Menu open={open} onClose={close} path={path} />
    </>
  );
}
