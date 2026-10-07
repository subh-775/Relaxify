/**
 * The shell: routing, the sidebar (a slide-in menu on phones), the home page,
 * and each page's frame.
 *
 * A small path router rather than a library: the routes are a fixed list known
 * at build time (nav.js), and the build writes a real HTML file for each.
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {FLAT, GET_PAGE, GROUPS, MOVED, SITE} from './nav.js';
import {Callout, GetApp, Note, Playing, href, nextOf, prevOf} from './brand.jsx';
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
const ownPage = pathname => {
  const p = toPath(pathname);
  return p === '/get' || p === '/p';
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

/* ── the sidebar ─────────────────────────────────────────────────────────── */

function SideNav({path}) {
  return (
    <nav className="nav" aria-label="Pages">
      <a className={path === '/' ? 'nav-item on' : 'nav-item'} href={href('/')} aria-current={path === '/' ? 'page' : undefined}>
        Home
      </a>
      <a className="nav-item" href={href(GET_PAGE)}>
        Get the app
      </a>
      {GROUPS.map(g => (
        <div key={g.title} className="nav-group">
          <span className="nav-title">{g.title}</span>
          {g.pages.map(p => (
            <a
              key={p.link}
              href={href(p.link)}
              className={path === p.link ? 'nav-item on' : 'nav-item'}
              aria-current={path === p.link ? 'page' : undefined}>
              {p.title}
            </a>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Sidebar({path, open, onClose}) {
  const panel = useRef(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = e => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // The panel itself takes focus: Tab goes on to its links, and a tap
    // does not leave a focus ring on the first one.
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  return (
    <>
      <div className={open ? 'scrim show' : 'scrim'} onClick={onClose} aria-hidden="true" />
      <aside ref={panel} tabIndex={-1} className={open ? 'side open' : 'side'} aria-label="Menu">
        <a className="side-brand" href={href('/')}>
          <Note size={34} />
          <span>Relaxify</span>
        </a>
        <SideNav path={path} />
        <div className="side-foot">
          <GetApp small />
          <a className="side-gh" href={SITE.repo} target="_blank" rel="noreferrer">
            <Github size={16} />
            Relaxify on GitHub
          </a>
        </div>
      </aside>
    </>
  );
}

/** Phones only: the bar with the menu button, the name and a way to download. */
function TopBar({onMenu, open}) {
  return (
    <header className="bar">
      <button type="button" className="menu" onClick={onMenu} aria-label="Open the menu" aria-expanded={open}>
        <span />
        <span />
        <span />
      </button>
      <a className="bar-brand" href={href('/')}>
        <Note size={26} />
        Relaxify
      </a>
      <a className="bar-get" href={href(GET_PAGE)}>
        Get the app
      </a>
    </header>
  );
}

/* ── home ────────────────────────────────────────────────────────────────── */

const HIGHLIGHTS = [
  ['One search, everywhere', 'Type a song once. Relaxify looks on JioSaavn, SoundCloud and YouTube and plays the best copy it finds.', '/play'],
  ['Keeps going', "When your songs run out, it carries on with ones like the song you're hearing.", '/play#it-never-runs-out'],
  ['Listen together', "Jam with friends: the same song at the same second, each on your own phone.", '/together'],
  ['Bring your playlists', 'Paste a Spotify or YouTube playlist link and get the same playlist in Relaxify.', '/music#bring-your-playlists'],
  ['Download songs', 'Real music files on your phone. They play without internet and stay if you remove the app.', '/music#downloads'],
  ['Your week in music', 'Every Sunday, a Recap of what you played most, made on your phone.', '/music#your-recap'],
];

function Home() {
  return (
    <main className="home" id="main">
      <section className="hero">
        <Playing />
        <h1>Music that just plays.</h1>
        <p className="lede">
          Relaxify is a free music app for Android. Search once, press play, and it keeps the music going. No
          account to make, no ads.
        </p>
        <div className="hero-actions">
          <GetApp />
          <a className="ghost" href={href('/start')}>
            How to get started
          </a>
        </div>
      </section>

      <section className="home-block" aria-labelledby="does">
        <h2 id="does">What it does</h2>
        <ul className="highlights">
          {HIGHLIGHTS.map(([title, text, link]) => (
            <li key={title}>
              <a href={href(link)}>
                <b>{title}</b>
                <span>{text}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="home-block" aria-labelledby="know">
        <h2 id="know">Good to know first</h2>
        <ul className="facts">
          <li>
            <b>Works on Android 8 and newer.</b> It isn't on the Play Store, so you download it here and install it
            yourself. <a href={href(GET_PAGE)}>See how</a>.
          </li>
          <li>
            <b>It updates itself.</b> When a new version is out, the app tells you and installs it over the old one.
          </li>
          <li>
            <b>Free and open.</b> Anyone can read how it's made, on GitHub.
          </li>
        </ul>
        <Callout kind="important" title="Never uninstall to update">
          Removing the app deletes your playlists, likes and history, and Android can't bring them back. Always
          update from inside the app.
        </Callout>
      </section>
    </main>
  );
}

/* ── a page ──────────────────────────────────────────────────────────────── */

function Page({route, page}) {
  const Content = BY_ROUTE[route].default;
  const next = nextOf(route);
  const prev = prevOf(route);
  return (
    <main className="page" id="main">
      <header className="page-head">
        <h1>{page.title}</h1>
        <p className="lede">{page.line}</p>
      </header>

      <article className="prose">
        <Content components={mdxComponents} />
      </article>

      <nav className="pager" aria-label="More pages">
        {prev ? (
          <a className="pager-link" href={href(prev.link)}>
            <small>Previous</small>
            {prev.title}
          </a>
        ) : (
          <span />
        )}
        {next && (
          <a className="pager-link next" href={href(next.link)}>
            <small>Next</small>
            {next.title}
          </a>
        )}
      </nav>

      <p className="edit">
        Something wrong or missing here?{' '}
        <a href={`${SITE.editBase}${route}.mdx`} target="_blank" rel="noreferrer">
          Suggest a change on GitHub
        </a>
        .
      </p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="page" id="main">
      <header className="page-head">
        <h1>This page isn't here.</h1>
        <p className="lede">It may have moved. Everything is in the menu, or start from the home page.</p>
      </header>
      <p>
        <a href={href('/')}>Go to the home page</a>
      </p>
    </main>
  );
}

/* ── the app ─────────────────────────────────────────────────────────────── */

export default function App() {
  const path = useRouter();
  const page = FLAT.find(p => p.link === path);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // A new page closes the menu behind it.
  useEffect(close, [path, close]);

  useEffect(() => {
    document.title = page ? `${page.title}: Relaxify` : 'Relaxify: music that just plays';
  }, [page]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to the page
      </a>
      <div className="shell">
        <Sidebar path={path} open={open} onClose={close} />
        <div className="col">
          <TopBar onMenu={() => setOpen(true)} open={open} />
          {path === '/' ? (
            <Home />
          ) : page && BY_ROUTE[path] ? (
            <Page route={path} page={page} />
          ) : MOVED[path] ? null : (
            <NotFound />
          )}
          <footer className="foot">
            <span>
              Relaxify is free and open source. It doesn't host any music: songs come from JioSaavn, SoundCloud and
              YouTube.
            </span>
            <span className="foot-links">
              <a href={SITE.repo} target="_blank" rel="noreferrer">
                GitHub
              </a>
              <a href={SITE.issues} target="_blank" rel="noreferrer">
                Report a problem
              </a>
            </span>
          </footer>
        </div>
      </div>
    </>
  );
}
