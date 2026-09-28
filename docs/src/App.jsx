/**
 * The shell: routing, the top bar, the home page, and each page's frame (its
 * coloured card up top, the reading column, the next page's card at the foot).
 *
 * A small path router rather than a library: the routes are a fixed list known
 * at build time (nav.js), and the build writes a real HTML file for each.
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {FLAT, MOVED, PAGES, PAL, SITE} from './nav.js';
import {Art, GetApp, Note, PageCard, Stack, href, nextOf} from './brand.jsx';
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
        // 'instant', spelled out: a new page is not somewhere you scrolled to.
        window.scrollTo({top: 0, left: 0, behavior: 'instant'});
      }
    });
  }, []);

  // An old address from the previous site: swap it for the new one in place,
  // so Back does not bounce through it.
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
      if (url.origin !== window.location.origin || !url.pathname.startsWith(BASE || '/')) {
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

/* ── the top bar ─────────────────────────────────────────────────────────── */

function TopBar({path}) {
  const [open, setOpen] = useState(false);
  const menuBtn = useRef(null);
  const close = useCallback(() => {
    setOpen(false);
    menuBtn.current?.focus();
  }, []);
  return (
    <header className="top">
      {/* On a phone the note opens the menu, exactly as it does in the app. */}
      <button
        ref={menuBtn}
        type="button"
        className="brand brand-menu"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}>
        <Note size={30} />
        <span>Relaxify</span>
      </button>
      <a className="brand brand-link" href={href('/')} aria-label="Relaxify docs, home">
        <Note size={30} />
        <span>Relaxify</span>
      </a>
      <nav className="chips" aria-label="Pages">
        {FLAT.map(p => (
          <a
            key={p.link}
            href={href(p.link)}
            className={path === p.link ? 'chip on' : 'chip'}
            style={{'--c': PAL[p.pal].bg}}
            aria-current={path === p.link ? 'page' : undefined}>
            <i aria-hidden="true" />
            {p.title}
          </a>
        ))}
      </nav>
      <a className="gh" href={SITE.repo} target="_blank" rel="noreferrer" aria-label="Relaxify on GitHub">
        <Github size={18} />
        <span>GitHub</span>
      </a>
      <Drawer open={open} onClose={close} path={path} />
    </header>
  );
}

/** The app's side drawer, for phones: the note and name, the pages, then
 *  the download and GitHub. Closes on a link, the dim area, or Escape. */
function Drawer({open, onClose, path}) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector('a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  // Following a link inside it lands on a new page: close behind it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onClose();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={open ? 'drawer open' : 'drawer'}>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <nav ref={panel} className="panel" aria-label="Menu">
        <div className="drawer-brand">
          <Note size={56} />
          <span>
            <b>Relaxify</b>
            <small>How to use the app</small>
          </span>
        </div>
        <a className={path === '/' ? 'drawer-item on' : 'drawer-item'} href={href('/')}>
          <i aria-hidden="true" />
          Home
        </a>
        {FLAT.map(p => (
          <a
            key={p.link}
            className={path === p.link ? 'drawer-item on' : 'drawer-item'}
            href={href(p.link)}
            style={{'--c': PAL[p.pal].bg}}
            aria-current={path === p.link ? 'page' : undefined}>
            <i aria-hidden="true" />
            {p.title}
          </a>
        ))}
        <div className="drawer-foot">
          <GetApp />
          <a className="ghost" href={SITE.repo} target="_blank" rel="noreferrer">
            <Github size={17} />
            GitHub
          </a>
          <small>Free and open source, GPL-3.0</small>
        </div>
      </nav>
    </div>
  );
}

/* ── home ────────────────────────────────────────────────────────────────── */

function Home() {
  return (
    <main className="home" id="main">
      <section className="hero">
        <div className="hero-words">
          <h1>
            Music that
            <br />
            just plays.
          </h1>
          <p>
            Relaxify is a free music app for Android. Search once and it looks
            everywhere, plays what you picked, and keeps going with songs you'll
            like. No account, no ads.
          </p>
          <div className="hero-actions">
            <GetApp />
            <a className="ghost" href={SITE.repo} target="_blank" rel="noreferrer">
              <Github size={17} />
              Star it on GitHub
            </a>
          </div>
        </div>
        <Stack />
      </section>

      <section className="all" aria-labelledby="all-title">
        <h2 id="all-title" className="group-title">
          Every page
        </h2>
        <div className="surface">
          {PAGES.map(p => (
            <a key={p.link} className="all-item" href={href(p.link)} style={{'--c': PAL[p.pal].bg}}>
              <i aria-hidden="true" />
              <span>
                <b>{p.title}</b>
                {p.card}
              </span>
              <small>{p.read}</small>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ── a page ──────────────────────────────────────────────────────────────── */

function Page({route, page}) {
  const Content = BY_ROUTE[route].default;
  const p = PAL[page.pal];
  const next = nextOf(route);
  return (
    <main className="page" id="main">
      {/* key: the card drops in again on every page change. */}
      <header key={route} className="page-hero" style={{'--bg': p.bg, '--ink': p.ink}}>
        {/* The note on Releases holds still; the other cards' art turns. */}
        <span className={page.art === 'note' ? 'page-art' : 'page-art spin'}>
          <PageArt page={page} />
        </span>
        <span className="page-words">
          <span className="page-kicker">{page.card}</span>
          <h1>{page.title}</h1>
        </span>
        <span className="page-read">{page.read ? `${page.read} read` : 'Live from GitHub'}</span>
      </header>

      <article className="prose">
        <Content components={mdxComponents} />
      </article>

      {next && (
        <nav className="next" aria-label="Next page">
          <span className="next-label">Next up</span>
          <PageCard page={next} pill="Read it" />
        </nav>
      )}

      <p className="edit">
        Something wrong or missing on this page?{' '}
        <a href={`${SITE.editBase}${route}.mdx`} target="_blank" rel="noreferrer">
          Suggest an edit on GitHub
        </a>
        .
      </p>
    </main>
  );
}

function PageArt({page}) {
  // The page's card art, bigger; the Releases card wears the note itself.
  return page.art === 'note' ? <Note size={150} /> : <Art kind={page.art} p={PAL[page.pal]} size={210} />;
}

function NotFound() {
  return (
    <main className="page" id="main">
      <header className="page-hero" style={{'--bg': PAL.night.bg, '--ink': PAL.night.ink}}>
        <h1>Nothing here.</h1>
        <p>That page moved or never existed. Start from the home page.</p>
      </header>
      <p className="edit">
        <a href={href('/')}>Back to the home page</a>
      </p>
    </main>
  );
}

/* ── the app ─────────────────────────────────────────────────────────────── */

export default function App() {
  const path = useRouter();
  const page = FLAT.find(p => p.link === path);

  useEffect(() => {
    document.title = page ? `Relaxify: ${page.title}` : 'Relaxify: music that just plays';
  }, [page]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to the page
      </a>
      <TopBar path={path} />
      {path === '/' ? <Home /> : page && BY_ROUTE[path] ? <Page route={path} page={page} /> : MOVED[path] ? null : <NotFound />}
      <footer className="foot">
        <span className="foot-brand">
          <Note size={22} />
          Relaxify
        </span>
        <span>
          Free and open source under GPL-3.0. Music comes from JioSaavn, SoundCloud and YouTube; Relaxify doesn't host any.
        </span>
        <span className="foot-links">
          <a href={SITE.repo} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href={SITE.issues} target="_blank" rel="noreferrer">
            Report a problem
          </a>
          <a href={href('/releases')}>Releases</a>
        </span>
      </footer>
    </>
  );
}
