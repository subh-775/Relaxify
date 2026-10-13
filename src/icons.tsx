/**
 * Every icon the app draws.
 *
 * The drawings live in glyphs.ts as data; this file only turns them into
 * react-native-svg elements. The set is Relaxify's own (it replaced lucide):
 * outline at rest, `solid` when on — a selected tab, a liked song, a
 * downloaded one — with a single stroke weight throughout.
 *
 * Import icons from this file. A new icon is a drawing in glyphs.ts plus one
 * line at the bottom here.
 */
import React from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {STROKE, partsOf, type GlyphName} from './glyphs';

export type IconProps = {
  size?: number;
  color?: string;
  /** Emphasis on a scale where 2 is the set's normal weight (1.8 on the
   *  24 grid), so 2.4 is a fifth heavier. Solid shapes ignore it. */
  strokeWidth?: number;
  /** Draw the "on" state: filled, or for the saved and downloaded marks a
   *  solid disc with the mark cut out. Glyphs with one state ignore it. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
};

export type IconComponent = React.NamedExoticComponent<IconProps>;

function glyph(name: GlyphName): IconComponent {
  const Icon = React.memo(function Icon({
    size = 24,
    color = '#ffffff',
    strokeWidth = 2,
    solid = false,
    style,
  }: IconProps) {
    const w = (STROKE * strokeWidth) / 2;
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
        {partsOf(name, solid).map((p, i) => {
          const filled = p.mode === 'fill' || p.mode === 'both';
          const stroked = p.mode !== 'fill';
          return (
            <Path
              key={i}
              d={p.d}
              fill={filled ? color : 'none'}
              fillRule="evenodd"
              stroke={stroked ? color : undefined}
              strokeWidth={stroked ? w * (p.w ?? 1) : undefined}
              strokeLinecap={p.cap ?? 'butt'}
              strokeLinejoin={p.join ?? 'round'}
            />
          );
        })}
      </Svg>
    );
  });
  Icon.displayName = name;
  return Icon;
}

export const Home = glyph('Home');
export const Search = glyph('Search');
export const Library = glyph('Library');
export const Play = glyph('Play');
export const Pause = glyph('Pause');
export const SkipForward = glyph('SkipForward');
export const SkipBack = glyph('SkipBack');
export const Shuffle = glyph('Shuffle');
export const Repeat = glyph('Repeat');
export const RepeatOne = glyph('RepeatOne');
export const Queue = glyph('Queue');
export const Lyrics = glyph('Lyrics');
export const Headphones = glyph('Headphones');
export const Speaker = glyph('Speaker');
export const Gauge = glyph('Gauge');
export const Timer = glyph('Timer');
export const Moon = glyph('Moon');
export const Heart = glyph('Heart');
export const CirclePlus = glyph('CirclePlus');
export const CircleCheck = glyph('CircleCheck');
export const Download = glyph('Download');
export const ArrowDownToLine = glyph('ArrowDownToLine');
export const MoreVertical = glyph('MoreVertical');
export const MoreHorizontal = glyph('MoreHorizontal');
export const ListPlus = glyph('ListPlus');
export const PlaylistAdd = glyph('PlaylistAdd');
export const ListX = glyph('ListX');
export const Grip = glyph('Grip');
export const Disc = glyph('Disc');
export const Artist = glyph('Artist');
export const User = glyph('User');
export const Radio = glyph('Radio');
export const Share = glyph('Share');
export const ArrowUpRight = glyph('ArrowUpRight');
export const ArrowRight = glyph('ArrowRight');
export const ArrowLeftRight = glyph('ArrowLeftRight');
export const ArrowUpDown = glyph('ArrowUpDown');
export const Trash = glyph('Trash');
export const X = glyph('X');
export const Plus = glyph('Plus');
export const Minus = glyph('Minus');
export const Check = glyph('Check');
export const ChevronDown = glyph('ChevronDown');
export const ChevronUp = glyph('ChevronUp');
export const ChevronLeft = glyph('ChevronLeft');
export const ChevronRight = glyph('ChevronRight');
export const Pencil = glyph('Pencil');
export const ImagePlus = glyph('ImagePlus');
export const Link = glyph('Link');
export const Clock = glyph('Clock');
export const Eye = glyph('Eye');
export const RefreshCw = glyph('RefreshCw');
export const Loader = glyph('Loader');
export const Square = glyph('Square');
export const CheckSquare = glyph('CheckSquare');
export const SquareX = glyph('SquareX');
export const AlertTriangle = glyph('AlertTriangle');
export const WifiOff = glyph('WifiOff');
export const HardDrive = glyph('HardDrive');
export const ChartColumn = glyph('ChartColumn');
export const Note = glyph('Note');
export const Notes = glyph('Notes');
export const Mic = glyph('Mic');
export const AudioLines = glyph('AudioLines');
export const SlidersHorizontal = glyph('SlidersHorizontal');
export const Guitar = glyph('Guitar');
export const Piano = glyph('Piano');
export const Drum = glyph('Drum');
export const Flame = glyph('Flame');
export const Sparkles = glyph('Sparkles');
export const Pin = glyph('Pin');
