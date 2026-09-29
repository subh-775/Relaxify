/**
 * The Relaxify mark, "Ember": a note drawn as one ribbon whose flag folds back
 * over itself, coral into berry.
 *
 * Drawn here rather than shipped as images, so it is sharp at every size and
 * can take one flat colour where a screen needs it (the Recap's cards). The
 * launcher icon draws the same paths (res/drawable/ic_launcher_foreground.xml);
 * change one, change both.
 */
import React, {useId} from 'react';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';

const NOTE =
  'M52 16 C52 13 55 12 57 13 C72 20 84 32 82 50 C81 58 77 63 72 66 C75 55 72 42 60 36 L60 70 C60 82 50 90 38 90 C27 90 19 83 19 74 C19 64 28 57 39 57 C44 57 48 58 52 61 Z';
const FOLD = 'M60 36 C72 42 75 55 72 66 C69 57 64 48 60 45 Z';
const SHINE =
  'M52 16 C52 13 55 12 57 13 C66 17 73 23 77 30 C70 26 62 24 56 26 L52 28 Z';

/** The note alone. `color` draws it flat in that colour; otherwise Ember. */
export function LogoMark({size, color}: {size: number; color?: string}) {
  const id = `ember${useId().replace(/:/g, '')}`;
  const fill = color ?? `url(#${id})`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {!color && (
        <Defs>
          <LinearGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#FFB38A" />
            <Stop offset="0.5" stopColor="#FF5A6E" />
            <Stop offset="1" stopColor="#C2185B" />
          </LinearGradient>
        </Defs>
      )}
      <Path d={NOTE} fill={fill} />
      {!color && <Path d={FOLD} fill="#000" opacity={0.38} />}
      {!color && <Path d={SHINE} fill="#fff" opacity={0.28} />}
    </Svg>
  );
}
