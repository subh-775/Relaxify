/**
 * Relaxify's own icons, drawn from src/glyphPaths.ts. Everything else in the
 * app is still lucide (src/icons.ts).
 *
 * Each one takes the props a lucide icon does, so swapping one in is an
 * import change at the call site. `strokeWidth` and `fill` are accepted and
 * ignored: the weight and the solid parts are part of the drawing, so a
 * caller asking for "2.4 when on" gets the same line as everywhere else and
 * colour alone says it is on.
 */
import React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {GLYPHS, type GlyphName} from './glyphPaths';
import {C} from './theme';

export type GlyphProps = {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  fill?: string;
  style?: StyleProp<ViewStyle>;
};

export function Glyph({
  name,
  size = 24,
  color = C.text,
  style,
}: GlyphProps & {name: GlyphName}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {GLYPHS[name].map((p, i) => {
        const tint = 'ink' in p && p.ink ? C.bg : color;
        return 'w' in p && p.w ? (
          <Path
            key={i}
            d={p.d}
            fill="none"
            stroke={tint}
            strokeWidth={p.w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <Path key={i} d={p.d} fill={tint} />
        );
      })}
    </Svg>
  );
}

const make = (name: GlyphName) => {
  const Icon = (props: GlyphProps) => <Glyph name={name} {...props} />;
  Icon.displayName = `Glyph(${name})`;
  return Icon;
};

export const HomeGlyph = make('home');
export const HomeOnGlyph = make('homeOn');
export const SearchGlyph = make('search');
export const SearchOnGlyph = make('searchOn');
export const LibraryGlyph = make('library');
export const LibraryOnGlyph = make('libraryOn');
export const PlusSlim = make('plus');
export const Shuffle = make('shuffle');
export const Repeat = make('repeat');
export const MoreVertical = make('more');
export const Queue = make('queue');
export const Headphones = make('headphones');
export const Play = make('play');
export const Pause = make('pause');
export const AddCircle = make('add');
export const SavedCircle = make('saved');
export const Trash = make('trash');
export const Pen = make('pen');
export const Devices = make('devices');
export const SleepTimer = make('timer');
export const MoreHorizontal = make('moreH');
export const AddToQueue = make('addQueue');
export const AddToPlaylist = make('addPlaylist');
export const Artist = make('artist');
export const SettingsGear = make('settings');
export const Equalizer = make('equalizer');
export const Jam = make('jam');
export const Help = make('help');
export const Languages = make('languages');
export const Share = make('share');
export const DownloadCircle = make('download');
export const DownloadedCircle = make('downloaded');
