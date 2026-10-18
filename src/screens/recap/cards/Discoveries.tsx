import React from 'react';
import {Text, View} from 'react-native';
import {Path} from 'react-native-svg';
import {rng, sparkle} from '../../../brandArt';
import {type Card, Layer, Rise} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function discoveriesCard({r}: CardContext): Card | null {
  if (!r.discoveries.length) {
    return null;
  }
  const d = r.discoveries;
  return {
    key: 'new',
    draw: (p, h) => {
      const R = rng(5);
      const stars = Array.from({length: 14}, (_, i) => (
        <Path
          key={i}
          d={sparkle(20 + R() * 320, 90 + R() * (h - 140), 6 + R() * 18)}
          fill={[p.a, p.b, p.c][i % 3]}
        />
      ));
      const tilts = [-6, 4, -3];
      return (
        <>
          <Layer h={h}>{stars}</Layer>
          <View style={[styles.content, styles.middle]}>
            <Rise i={0}>
              <Text style={[styles.lbl, {color: p.ink}]}>
                New to you this week
              </Text>
            </Rise>
            <Rise i={1}>
              <Text style={[styles.fig, styles.fig130, {color: p.ink}]}>
                {d.length}
              </Text>
            </Rise>
            <Rise i={2}>
              <Text style={[styles.h1, {color: p.ink}]}>
                {d.length === 1 ? 'new artist' : 'new artists'}
              </Text>
            </Rise>
            <Rise i={3} style={styles.pills}>
              {d.slice(0, 3).map((a, i) => (
                <View
                  key={a.name}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: [p.a, p.b, p.c][i % 3],
                      marginLeft: i * 28,
                      transform: [{rotate: `${tilts[i % 3]}deg`}],
                    },
                  ]}>
                  <Text style={styles.pillText} numberOfLines={1}>
                    {a.name}
                  </Text>
                </View>
              ))}
              {d.length > 3 && (
                <Text style={[styles.line, {color: p.ink}]}>
                  {`and ${d.length - 3} more`}
                </Text>
              )}
            </Rise>
          </View>
        </>
      );
    },
  };
}
