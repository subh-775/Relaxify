/**
 * The Recap's drawing kit: the pieces every card is made of (the turning
 * starburst, the rising words, covers, top-five rows, tube squiggles, pixel
 * flowers) and the small helpers their words use. Drawn on the CW-wide
 * design canvas; RecapScreen scales it to the phone.
 */
import React, {useEffect} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInUp,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {FLOWER, type Pal} from '../../brandArt';
import {FONT} from '../../font';
import {CW, styles} from './styles';


export const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "3 h 12 min", "38 min". */
export function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function dayMonth(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function times(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

// ── Shapes: plain path strings, the same ones the demo drew ─────────────
export function wave(
  x0: number,
  x1: number,
  y: number,
  amp: number,
  len: number,
) {
  let d = `M${x0},${y}`;
  for (let x = x0; x < x1; x += len) {
    d += `Q${x + len / 4},${y - amp} ${x + len / 2},${y} T${x + len},${y}`;
  }
  return d;
}

/** A small pixel-art flower. */
export function Pixels({
  x,
  y,
  cell,
  fill,
}: {
  x: number;
  y: number;
  cell: number;
  fill: string;
}) {
  const out: React.ReactNode[] = [];
  FLOWER.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch === 'X') {
        out.push(
          <Rect
            key={`${i}:${j}`}
            x={x + i * cell}
            y={y + j * cell}
            width={cell}
            height={cell}
            fill={fill}
          />,
        );
      }
    }),
  );
  return <>{out}</>;
}

/** A tube squiggle: a dark outline under a gradient stroke. */
export function Tube({
  d,
  grad,
  ink,
  w = 16,
}: {
  d: string;
  grad: string;
  ink: string;
  w?: number;
}) {
  return (
    <>
      <Path
        d={d}
        fill="none"
        stroke={ink}
        strokeWidth={w + 7}
        strokeLinecap="round"
      />
      <Path
        d={d}
        fill="none"
        stroke={`url(#${grad})`}
        strokeWidth={w}
        strokeLinecap="round"
      />
    </>
  );
}

export function Grad({
  id,
  from,
  to,
  x2 = 1,
  y2 = 1,
}: {
  id: string;
  from: string;
  to: string;
  x2?: number;
  y2?: number;
}) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2={String(x2)} y2={String(y2)}>
      <Stop offset="0" stopColor={from} />
      <Stop offset="1" stopColor={to} />
    </LinearGradient>
  );
}

/** A full-canvas drawing layer. */
export function Layer({h, children}: {h: number; children: React.ReactNode}) {
  return (
    <Svg
      width={CW}
      height={h}
      viewBox={`0 0 ${CW} ${h}`}
      style={StyleSheet.absoluteFill}>
      {children}
    </Svg>
  );
}

/** A rotation that runs forever while mounted (none with reduce motion). */
export function useTurn(ms: number) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!reduce) {
      turn.value = withRepeat(
        withTiming(360, {duration: ms, easing: Easing.linear}),
        -1,
      );
    }
    return () => cancelAnimation(turn);
  }, [turn, ms, reduce]);
  return useAnimatedStyle(() => ({
    transform: [{rotate: `${turn.value}deg`}],
  }));
}

/**
 * Artwork that turns slowly on its own centre: its own small Svg inside a
 * rotating view, with the viewBox offset so the shape keeps the canvas
 * coordinates it was drawn in.
 */
export function Spin({
  cx,
  cy,
  r,
  ms = 40000,
  children,
}: {
  cx: number;
  cy: number;
  r: number;
  ms?: number;
  children: React.ReactNode;
}) {
  const style = useTurn(ms);
  return (
    <Animated.View
      style={[
        styles.abs,
        {left: cx - r, top: cy - r, width: 2 * r, height: 2 * r},
        style,
      ]}>
      <Svg
        width={2 * r}
        height={2 * r}
        viewBox={`${cx - r} ${cy - r} ${2 * r} ${2 * r}`}>
        {children}
      </Svg>
    </Animated.View>
  );
}

/** A round view (the record's label) turning with the record. */
export function SpinningLabel({
  cx,
  cy,
  r,
  children,
}: {
  cx: number;
  cy: number;
  r: number;
  children: React.ReactNode;
}) {
  const style = useTurn(6000);
  return (
    <Animated.View
      style={[
        styles.abs,
        {left: cx - r, top: cy - r, width: 2 * r, height: 2 * r},
        style,
      ]}>
      {children}
    </Animated.View>
  );
}

/** A cover, or the title's initials on the palette when there is none. */
export function Cover({
  uri,
  size,
  title,
  pal,
  round = false,
}: {
  uri?: string;
  size: number;
  title: string;
  pal: Pal;
  round?: boolean;
}) {
  const box = {
    width: size,
    height: size,
    borderRadius: round ? size / 2 : size * 0.08,
  };
  if (uri) {
    return <Image source={{uri}} style={box} />;
  }
  const words = title.split(/[\s,]+/).filter(Boolean);
  const ini = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
  return (
    <View style={[box, styles.clip]}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <Grad id="cv" from={pal.a} to={pal.b} />
        </Defs>
        <Rect width="100" height="100" fill="url(#cv)" />
        <SvgText
          x="10"
          y="88"
          fontFamily={FONT}
          fontWeight="800"
          fontSize="38"
          fill="#fff">
          {ini}
        </SvgText>
      </Svg>
    </View>
  );
}

/** One entrance per card: the words rise in turn. */
export function Rise({
  i,
  children,
  style,
}: {
  i: number;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInUp.duration(500)
        .delay(i * 80)
        .reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  );
}

/** A top-five row. The ranks are a real order. */
export function Row({
  i,
  title,
  sub,
  uri,
  n,
  pal,
  round,
}: {
  i: number;
  title: string;
  sub?: string;
  uri?: string;
  n: number;
  pal: Pal;
  round?: boolean;
}) {
  const ink = {color: pal.ink};
  return (
    <View style={styles.li}>
      <Text style={[styles.liN, ink, i === 0 && styles.liNTop]}>{i + 1}</Text>
      <Cover
        uri={uri}
        size={i ? 50 : 62}
        title={title}
        pal={pal}
        round={round}
      />
      <View style={styles.liText}>
        <Text
          style={[styles.liA, ink, i === 0 && styles.liATop]}
          numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={[styles.liB, ink]} numberOfLines={1}>
            {sub}
          </Text>
        )}
      </View>
      <Text style={[styles.liC, ink]}>{n}</Text>
    </View>
  );
}

export type Card = {
  key: string;
  draw: (p: Pal, h: number) => React.ReactNode;
};

/** A vertical position from the 760-tall design, spread over height `h`. */
export const at760 = (h: number) => (v: number) => (v * h) / 760;
