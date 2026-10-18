import React from 'react';
import {Text, View} from 'react-native';
import {Circle, Text as SvgText} from 'react-native-svg';
import {FONT} from '../../../font';
import {at760, type Card, duration, Layer, Pixels, Rise} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function lastWeekCard({r, week}: CardContext): Card | null {
  if (
    !(week && r.minutes != null && r.lastMinutes != null && r.lastMinutes > 0)
  ) {
    return null;
  }
  const nowM = r.minutes;
  const lastM = r.lastMinutes;
  const diff = nowM - lastM;
  const pct = Math.round((Math.abs(diff) / lastM) * 100);
  return {
    key: 'vs',
    draw: (p, h) => {
      const Y = at760(h);
      // Areas to scale: the bigger week gets the full circle.
      const top = Math.max(nowM, lastM);
      const rNow = 128 * Math.sqrt(nowM / top);
      const rLast = 128 * Math.sqrt(lastM / top);
      const label = (x: number, y: number, size: number, text: string) => (
        <SvgText
          x={x}
          y={y}
          textAnchor="middle"
          fontFamily={FONT}
          fontSize={String(size)}
          fontWeight="800"
          fill={p.ink}>
          {text}
        </SvgText>
      );
      return (
        <>
          <Layer h={h}>
            <Circle cx={130} cy={Y(470)} r={rLast} fill={p.b} />
            <Circle cx={218} cy={Y(486)} r={rNow} fill={p.a} opacity={0.92} />
            {label(100, Y(420), 13, 'Last week')}
            {label(100, Y(440), 16, duration(lastM))}
            {label(240, Y(500), 14, 'This week')}
            {label(240, Y(526), 22, duration(nowM))}
            <Pixels x={270} y={Y(640)} cell={8} fill={p.c} />
          </Layer>
          <View style={[styles.content, styles.listTop]}>
            <Rise i={0}>
              <Text style={[styles.lbl, {color: p.ink}]}>
                Compared with last week
              </Text>
            </Rise>
            <Rise i={1}>
              <Text
                style={[styles.fig, styles.fig76, {color: p.ink}]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {diff >= 0 ? `+${duration(diff)}` : `-${duration(-diff)}`}
              </Text>
            </Rise>
            <Rise i={2}>
              <Text style={[styles.line, {color: p.ink}]}>
                {diff >= 0
                  ? `${pct}% more music than last week.`
                  : `${pct}% less music than last week.`}
              </Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
