import React from 'react';
import {Text, View} from 'react-native';
import {Path, Rect} from 'react-native-svg';
import {blob} from '../../../brandArt';
import {type Card, Layer, Rise, Row, Spin} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function topArtistsCard({r, week, face}: CardContext): Card | null {
  if (!(r.topArtists.length > 1)) {
    return null;
  }
  return {
    key: 'artists',
    draw: (p, h) => {
      const check: React.ReactNode[] = [];
      for (let j = 0; j < Math.ceil(h / 18); j++) {
        for (let i = 0; i < 2; i++) {
          if ((i + j) % 2) {
            check.push(
              <Rect
                key={`${i}:${j}`}
                x={i * 18}
                y={j * 18}
                width={18}
                height={18}
                fill={j % 6 < 3 ? p.a : p.b}
              />,
            );
          }
        }
      }
      return (
        <>
          <Layer h={h}>{check}</Layer>
          <Spin cx={330} cy={h - 60} r={140}>
            <Path d={blob(330, h - 60, 110, 0.25, 8, 11)} fill={p.c} />
          </Spin>
          <View style={[styles.content, styles.listTop, styles.besideStrip]}>
            <Rise i={0}>
              <Text style={[styles.h1, styles.h34, {color: p.ink}]}>
                {week ? 'Your top artists this week' : 'Your top artists'}
              </Text>
            </Rise>
            <Rise i={1} style={styles.list}>
              {r.topArtists.map((a, i) => (
                <Row
                  key={`${i}:${a.name}`}
                  i={i}
                  title={a.name}
                  uri={face(a)}
                  n={a.count}
                  pal={p}
                  round
                />
              ))}
            </Rise>
          </View>
        </>
      );
    },
  };
}
