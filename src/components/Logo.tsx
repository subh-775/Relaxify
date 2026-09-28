/**
 * The Relaxify mark, "Satin": a note drawn as two gold ribbons, the stem with
 * its head and the flag, with a gap of light between them.
 *
 * Drawn here rather than shipped as images, so it is sharp at every size and
 * can take one flat colour where a screen needs it (the Recap's cards). The
 * launcher icon draws the same paths (res/drawable/ic_launcher_foreground.xml);
 * change one, change both.
 */
import React, {useId} from 'react';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';

const STEM =
  'M50 14 H58 V70 C58 83 49 90 38 90 C27 90 19 83 19 73 C19 63 28 56 38 56 C43 56 47 57 50 59 Z';
const FLAG = 'M63 14 C76 20 86 30 84 46 C83 54 79 60 73 63 C75 52 70 40 63 34 Z';
const SHINE = 'M63 14 C70 17 76 22 80 28 C74 26 68 27 63 30 Z';
const FOLD = 'M63 34 C70 40 75 52 73 63 C77 52 74 42 66 36 Z';

/** The note alone. `color` draws it flat in that colour; otherwise gold. */
export function LogoMark({size, color}: {size: number; color?: string}) {
  const id = `satin${useId().replace(/:/g, '')}`;
  const fill = color ?? `url(#${id})`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {!color && (
        <Defs>
          <LinearGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#FFF1D6" />
            <Stop offset="0.5" stopColor="#E3B878" />
            <Stop offset="1" stopColor="#8A5A2B" />
          </LinearGradient>
        </Defs>
      )}
      <Path d={STEM} fill={fill} />
      <Path d={FLAG} fill={fill} />
      {!color && <Path d={SHINE} fill="#fff" opacity={0.4} />}
      {!color && <Path d={FOLD} fill="#000" opacity={0.3} />}
    </Svg>
  );
}
