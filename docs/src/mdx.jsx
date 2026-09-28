/**
 * What MDX renders into. Pages are plain markdown with a few of the site's own
 * pieces (Banner, Row, Fold, Steps, GetApp, RecapFlip, ReleaseBadges) dropped
 * in where a paragraph would be duller than a card.
 */
import {Art, Banner, Fold, GetApp, RecapFlip, ReleaseBadges, Row, Steps, href} from './brand.jsx';
import {External} from './icons.jsx';

/** Links: in-site ones get the GitHub Pages base; outside ones open in a new
 *  tab and carry a small arrow icon so you know you're leaving. */
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
  Art,
  Banner,
  Row,
  Fold,
  Steps,
  GetApp,
  RecapFlip,
  ReleaseBadges,
};
