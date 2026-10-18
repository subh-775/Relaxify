import React from 'react';
import {Text, View} from 'react-native';
import {Defs, Path, Rect, Text as SvgText} from 'react-native-svg';
import {FONT} from '../../../font';
import {
  at760,
  type Card,
  DAYS,
  duration,
  Grad,
  Layer,
  Rise,
  wave,
} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function listeningTimeCard({r, week}: CardContext): Card | null {
  if (!(week && r.days && r.minutes != null)) {
    return null;
  }
  const days = r.days;
  const minutes = r.minutes;
  const max = Math.max(1, ...days.map(d => d.songs));
  const big = r.busiest >= 0 ? days[r.busiest] : null;
  return {
    key: 'time',
    draw: (p, h) => {
      const Y = at760(h);
      const base = h - 150;
      return (
        <>
          <Layer h={h}>
            <Defs>
              <Grad id="g6" from={p.b} to={p.a} x2={0} />
            </Defs>
            {[0, 1, 2, 3].map(i => (
              <Path
                key={i}
                d={wave(-40, 420, Y(110) + i * 26, 10, 60)}
                fill="none"
                stroke={i % 2 ? p.a : p.c}
                strokeWidth={6}
                strokeLinecap="round"
              />
            ))}
            {days.map((d, i) => {
              const bh = Math.max(8, (d.songs / max) * 200);
              const on = i === r.busiest;
              return (
                <React.Fragment key={d.at}>
                  <Rect
                    x={28 + i * 45}
                    y={base - bh}
                    width={36}
                    height={bh}
                    rx={18}
                    fill={on ? 'url(#g6)' : p.ink}
                    opacity={on ? 1 : 0.18}
                  />
                  <SvgText
                    x={46 + i * 45}
                    y={base + 26}
                    textAnchor="middle"
                    fontFamily={FONT}
                    fontSize="13"
                    fontWeight="800"
                    fill={p.ink}>
                    {DAYS[new Date(d.at).getDay()].slice(0, 1)}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Layer>
          <View style={[styles.content, {paddingTop: Y(250)}]}>
            <Rise i={0}>
              <Text style={[styles.lbl, {color: p.ink}]}>You listened for</Text>
            </Rise>
            <Rise i={1}>
              <Text style={[styles.fig, styles.fig64, {color: p.ink}]}>
                {duration(minutes)}
              </Text>
            </Rise>
            <View style={styles.fill} />
            {big && (
              <Rise i={2}>
                <Text style={[styles.line, {color: p.ink}]}>
                  {`${
                    DAYS[new Date(big.at).getDay()]
                  } was your biggest day, with ${big.songs} ${
                    big.songs === 1 ? 'song' : 'songs'
                  }.`}
                </Text>
              </Rise>
            )}
          </View>
        </>
      );
    },
  };
}
