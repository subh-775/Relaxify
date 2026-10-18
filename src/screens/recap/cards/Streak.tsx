import React from 'react';
import {Text, View} from 'react-native';
import {Circle, Path} from 'react-native-svg';
import {blob, burst} from '../../../brandArt';
import {at760, type Card, Layer, Rise, Spin} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function streakCard({r}: CardContext): Card | null {
  if (!(r.streak >= 2)) {
    return null;
  }
  const {streak, bestStreak} = r;
  return {
    key: 'streak',
    draw: (p, h) => {
      const Y = at760(h);
      const beads = Math.min(bestStreak, 12);
      const step = beads > 1 ? 292 / (beads - 1) : 0;
      return (
        <>
          <Spin cx={250} cy={Y(300)} r={185}>
            <Path d={blob(250, Y(300), 150, 0.22, 10, 21)} fill={p.a} />
          </Spin>
          <Layer h={h}>
            <Path d={burst(250, Y(300), 62, 40, 9)} fill={p.c} />
            {Array.from({length: beads}, (_, i) => {
              const x = 34 + i * step;
              const y = Y(560) + Math.sin(i * 0.9) * 22;
              return i < Math.min(streak, beads) ? (
                <Circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={11}
                  fill={[p.a, p.b, p.c][i % 3]}
                  stroke={p.ink}
                  strokeWidth={2.5}
                />
              ) : (
                <Circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={10}
                  fill="none"
                  stroke={p.ink}
                  strokeWidth={2.5}
                  strokeDasharray="4 3"
                />
              );
            })}
          </Layer>
          <View style={[styles.content, {paddingTop: Y(150)}]}>
            <Rise i={0}>
              <Text style={[styles.lbl, {color: p.ink}]}>
                Days in a row with music
              </Text>
            </Rise>
            <Rise i={1}>
              <Text style={[styles.fig, styles.fig170, {color: p.ink}]}>
                {streak}
              </Text>
            </Rise>
            <View style={styles.fill} />
            <Rise i={2}>
              <Text style={[styles.line, {color: p.ink}]}>
                {streak >= bestStreak
                  ? 'Your longest run yet. Play something tomorrow to keep it going.'
                  : `Your best is ${bestStreak}. Play something tomorrow to keep it going.`}
              </Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
