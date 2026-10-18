import React from 'react';
import {Text, View} from 'react-native';
import {Circle, Defs, Path} from 'react-native-svg';
import {getBestArtworkUrl} from '../../../tracks';
import {
  at760,
  type Card,
  Cover,
  DAYS,
  Grad,
  Layer,
  Rise,
  Spin,
  SpinningLabel,
} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function onRepeatCard({r}: CardContext): Card | null {
  if (!r.onRepeat) {
    return null;
  }
  const o = r.onRepeat;
  return {
    key: 'repeat',
    draw: (p, h) => {
      const cy = at760(h)(400);
      const arc = `M60,${cy - 150} A150,150 0 0 1 312,${cy - 100}`;
      const grooves = Array.from({length: 9}, (_, i) => (
        <Circle
          key={i}
          cx={180}
          cy={cy}
          r={66 + i * 9}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth={1.5}
        />
      ));
      return (
        <>
          <Layer h={h}>
            <Defs>
              <Grad id="g8" from={p.a} to={p.c} y2={0} />
            </Defs>
            <Path
              d={arc}
              fill="none"
              stroke={p.ink}
              strokeWidth={20}
              strokeLinecap="round"
            />
            <Path
              d={arc}
              fill="none"
              stroke="url(#g8)"
              strokeWidth={12}
              strokeLinecap="round"
            />
            <Path
              d={`M296,${cy - 130} L330,${cy - 100} L292,${cy - 82}Z`}
              fill={p.ink}
            />
          </Layer>
          <Spin cx={180} cy={cy} r={148} ms={6000}>
            <Circle cx={180} cy={cy} r={148} fill="#121016" />
            {grooves}
          </Spin>
          {/* The record's label is the song's own cover, turning with it. */}
          <SpinningLabel cx={180} cy={cy} r={54}>
            <Cover
              uri={getBestArtworkUrl(o.track)}
              size={108}
              title={o.track.title}
              pal={p}
              round
            />
          </SpinningLabel>
          <View style={[styles.content, styles.center]}>
            <Rise i={0}>
              <Text style={[styles.lbl, styles.centerText, {color: p.ink}]}>
                {`On ${
                  DAYS[new Date(o.day).getDay()]
                } you could not stop playing`}
              </Text>
            </Rise>
            <View style={styles.fill} />
            <Rise i={1}>
              <Text
                style={[styles.h1, styles.centerText, {color: p.ink}]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}>
                {o.track.title}
              </Text>
            </Rise>
            <Rise i={2}>
              <Text style={[styles.line, styles.centerText, {color: p.ink}]}>
                {`${o.count} times in one day.`}
              </Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
