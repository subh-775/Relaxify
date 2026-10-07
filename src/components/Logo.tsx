/**
 * The Relaxify mark: two notes, a big coral one in front and a smaller berry
 * one behind it, each a single ribbon whose flag folds back over itself.
 *
 * Drawn here rather than shipped as images, so it is sharp at every size and
 * can take one flat colour where a screen needs it (the Recap's cards). The
 * launcher, themed and status-bar icons and the docs draw the same paths and
 * placements (res/drawable/ic_launcher_*.xml, ic_stat_recap.xml, the RC
 * build's res, docs/public/logo.svg); change one, change all.
 */
import React, {useId} from 'react';
import Svg, {Defs, G, LinearGradient, Path, Stop} from 'react-native-svg';

const NOTE =
  'M52 16 C52 13 55 12 57 13 C72 20 84 32 82 50 C81 58 77 63 72 66 C75 55 72 42 60 36 L60 70 C60 82 50 90 38 90 C27 90 19 83 19 74 C19 64 28 57 39 57 C44 57 48 58 52 61 Z';
const SHINE =
  'M52 16 C52 13 55 12 57 13 C66 17 73 23 77 30 C70 26 62 24 56 26 L52 28 Z';
/** Where each note sits in the 100-unit box (the same note, placed twice). */
const BACK = 'translate(-6.96 -3.78) scale(0.7022)';
const FRONT = 'translate(4.89 -2.03) scale(1.0721)';

/** The mark. `color` draws both notes flat in that colour (the one behind a
 *  shade lighter); otherwise in their own gradients. */
export function LogoMark({size, color}: {size: number; color?: string}) {
  const id = `mark${useId().replace(/:/g, '')}`;
  const note = (which: 'b' | 'f') => (
    <G transform={which === 'b' ? BACK : FRONT}>
      <Path
        d={NOTE}
        fill={color ?? `url(#${id}${which})`}
        opacity={color && which === 'b' ? 0.55 : 1}
      />
      {!color && <Path d={SHINE} fill="#fff" opacity={0.3} />}
    </G>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {!color && (
        <Defs>
          <LinearGradient id={`${id}b`} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#C0606C" />
            <Stop offset="0.5" stopColor="#A12C48" />
            <Stop offset="1" stopColor="#6E1030" />
          </LinearGradient>
          <LinearGradient id={`${id}f`} x1="0.1" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#FF9AA0" />
            <Stop offset="0.5" stopColor="#FF5A6E" />
            <Stop offset="1" stopColor="#E2266A" />
          </LinearGradient>
        </Defs>
      )}
      {note('b')}
      {note('f')}
    </Svg>
  );
}
