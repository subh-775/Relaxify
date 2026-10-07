/**
 * What MDX renders into. Pages are plain Markdown with a few of the site's
 * own blocks (Steps, Fold, Group, Callout, Moves, GetApp, ReleaseInfo).
 */
import {Callout, Fold, GetApp, Group, Move, Moves, ReleaseInfo, Steps, href} from './brand.jsx';
import {External} from './icons.jsx';

/** Links: in-site ones get the GitHub Pages base; outside ones open in a new
 *  tab and carry a small arrow so you know you're leaving the site. */
function Anchor({href: to = '', children, ...rest}) {
  const external = /^https?:/.test(to);
  if (!external && to.startsWith('/')) {
    return (
      <a href={href(to)} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <a href={to} target="_blank" rel="noreferrer" {...rest}>
      {children}
      {external && <External size={12} />}
    </a>
  );
}

/** Wide tables scroll inside their own box, never the page. */
function Table(props) {
  return (
    <div className="tablewrap">
      <table {...props} />
    </div>
  );
}

export const mdxComponents = {
  a: Anchor,
  table: Table,
  Callout,
  Fold,
  GetApp,
  Group,
  Move,
  Moves,
  ReleaseInfo,
  Steps,
};
