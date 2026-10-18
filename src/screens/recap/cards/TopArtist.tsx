import React from 'react';
import {Text, View} from 'react-native';
import {Circle, Path} from 'react-native-svg';
import {at760, type Card, Cover, Layer, Rise, Spin} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function topArtistCard({r, week, face}: CardContext): Card | null {
  if (!r.topArtist) {
    return null;
  }
  const a = r.topArtist;
  return {
    key: 'artist',
    draw: (p, h) => {
      const cy = at760(h)(380);
      const rays = Array.from({length: 32}, (_, i) => {
        const a0 = (i / 32) * Math.PI * 2;
        const a1 = ((i + 0.5) / 32) * Math.PI * 2;
        const x0 = 180 + Math.cos(a0) * 560;
        const y0 = cy + Math.sin(a0) * 560;
        const x1 = 180 + Math.cos(a1) * 560;
        const y1 = cy + Math.sin(a1) * 560;
        return (
          <Path
            key={i}
            d={`M180,${cy} L${x0},${y0} L${x1},${y1}Z`}
            fill={i % 2 ? p.a : p.c}
          />
        );
      });
      return (
        <>
          <Spin cx={180} cy={cy} r={560}>
            {rays}
          </Spin>
          <Layer h={h}>
            <Circle cx={180} cy={cy} r={118} fill={p.bg} />
            <Circle
              cx={180}
              cy={cy}
              r={118}
              fill="none"
              stroke={p.b}
              strokeWidth={10}
            />
          </Layer>
          <View style={[styles.artistFace, {top: cy - 96}]}>
            <Cover uri={face(a)} size={192} title={a.name} pal={p} round />
          </View>
          <View style={[styles.content, styles.center]}>
            <Rise i={0} style={[styles.pill, {backgroundColor: p.bg}]}>
              <Text style={[styles.lbl, {color: p.ink}]}>
                {week ? 'Your artist of the week' : 'Your most played artist'}
              </Text>
            </Rise>
            <View style={styles.fill} />
            <Rise i={1} style={[styles.plate, {backgroundColor: p.bg}]}>
              <Text
                style={[styles.h1, styles.centerText, {color: p.ink}]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}>
                {a.name}
              </Text>
              <Text style={[styles.line, styles.centerText, {color: p.ink}]}>
                {`${a.count} ${a.count === 1 ? 'play' : 'plays'}${
                  week ? ' this week' : ''
                }.`}
              </Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
