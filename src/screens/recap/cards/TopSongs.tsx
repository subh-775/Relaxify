import React from 'react';
import {Text, View} from 'react-native';
import {Circle, Path, Text as SvgText} from 'react-native-svg';
import {sparkle} from '../../../brandArt';
import {FONT} from '../../../font';
import {getBestArtworkUrl} from '../../../tracks';
import {type Card, Layer, Rise, Row} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function topSongsCard({r, week}: CardContext): Card | null {
  if (!(r.topSongs.length > 1)) {
    return null;
  }
  return {
    key: 'songs',
    draw: (p, h) => (
      <>
        <Layer h={h}>
          <SvgText
            x={392}
            y={h - 18}
            textAnchor="end"
            fontFamily={FONT}
            fontSize="470"
            fontWeight="800"
            fill="none"
            stroke={p.a}
            strokeWidth={4}>
            5
          </SvgText>
          <Circle
            cx={360}
            cy={0}
            r={120}
            fill="none"
            stroke={p.b}
            strokeWidth={22}
          />
          <Circle
            cx={360}
            cy={0}
            r={72}
            fill="none"
            stroke={p.c}
            strokeWidth={22}
          />
          <Path d={sparkle(40, h - 60, 14)} fill={p.b} />
        </Layer>
        <View style={[styles.content, styles.listTop]}>
          <Rise i={0}>
            <Text style={[styles.h1, styles.h34, {color: p.ink}]}>
              {week ? 'Your top songs this week' : 'Your top songs'}
            </Text>
          </Rise>
          <Rise i={1} style={styles.list}>
            {r.topSongs.map((s, i) => (
              <Row
                key={`${i}:${s.track.title}`}
                i={i}
                title={s.track.title}
                sub={s.track.artist}
                uri={getBestArtworkUrl(s.track)}
                n={s.count}
                pal={p}
              />
            ))}
          </Rise>
        </View>
      </>
    ),
  };
}
