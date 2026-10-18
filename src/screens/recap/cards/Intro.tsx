import React from 'react';
import {Text, View} from 'react-native';
import {Defs, Path} from 'react-native-svg';
import {blob, burst} from '../../../brandArt';
import {
  at760,
  type Card,
  dayMonth,
  duration,
  Grad,
  Layer,
  Pixels,
  Rise,
  Spin,
  Tube,
  wave,
} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function introCard({r, week, now}: CardContext): Card {
  return {
    key: 'intro',
    draw: (p, h) => {
      const Y = at760(h);
      const ink = {color: p.ink};
      return (
        <>
          <Spin cx={262} cy={Y(300)} r={148}>
            <Path d={burst(262, Y(300), 146, 88, 13)} fill={p.a} />
          </Spin>
          <Layer h={h}>
            <Defs>
              <Grad id="g1" from={p.a} to={p.c} y2={0} />
            </Defs>
            <Path d={blob(262, Y(300), 72, 0.18, 9, 3)} fill={p.b} />
            <Tube d={wave(-40, 420, Y(118), 30, 150)} grad="g1" ink={p.ink} />
            <Pixels x={18} y={Y(196)} cell={9} fill={p.c} />
          </Layer>
          <View style={[styles.content, styles.bottom]}>
            <Rise i={0}>
              <Text style={[styles.lbl, ink]}>
                {week
                  ? `${dayMonth(now - 6 * 24 * 60 * 60 * 1000)} to ${dayMonth(
                      now,
                    )}`
                  : 'Everything you have played'}
              </Text>
            </Rise>
            <Rise i={1}>
              <Text style={[styles.fig, styles.fig120, ink]}>{r.songs}</Text>
            </Rise>
            <Rise i={2}>
              <Text style={[styles.h1, ink]}>
                {r.songs === 1 ? 'song' : 'songs'}
                {week ? ' this week' : ' and counting'}
              </Text>
            </Rise>
            {week && r.minutes != null && (
              <Rise i={3}>
                <Text style={[styles.line, ink]}>
                  {`${duration(r.minutes)} of music.`}
                </Text>
              </Rise>
            )}
          </View>
        </>
      );
    },
  };
}
