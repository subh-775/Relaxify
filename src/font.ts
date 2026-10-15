/**
 * DM Sans on every Text and TextInput in the app.
 *
 * A Text with no fontFamily renders in the phone's own system font, and that
 * is not one font: Roboto on one phone, a maker's own face on the next, so the
 * same screen looked different per brand. The family is bundled in
 * res/font and registered in MainApplication; this names it as the default.
 *
 * It PREPENDS the family to the component's own style rather than replacing
 * it, so every style still wins — including a fontFamily set on purpose.
 *
 * ponytail: wraps the forwardRef render of RN's own Text/TextInput. A codemod
 * adding fontFamily to ~70 StyleSheets would miss any text styled inline. If
 * RN ever stops shipping these as forwardRef, the guard below makes this a
 * no-op (system font again) rather than a crash; move to a wrapper component
 * then.
 */
import {Text, TextInput} from 'react-native';

/**
 * Spotify's own face, Spotify Mix, is not available to anyone else. DM Sans
 * is the nearest open one: the same round, low-contrast geometric letters, a
 * two-storey a, a straight-tailed y, and a smaller x-height than Plus Jakarta
 * Sans had, so a 16px row reads at Spotify's size rather than a size up.
 */
export const FONT = 'DM Sans';

const base = {fontFamily: FONT};

type Renderable = {
  render?: (props: {style?: unknown}, ref: unknown) => unknown;
};

/** Returns true when the component was patched. */
export function withDefaultFont(component: unknown): boolean {
  const c = component as Renderable;
  const render = c?.render;
  if (typeof render !== 'function') {
    return false;
  }
  c.render = function (props, ref) {
    return render.call(this, {...props, style: [base, props.style]}, ref);
  };
  return true;
}

withDefaultFont(Text);
withDefaultFont(TextInput);
