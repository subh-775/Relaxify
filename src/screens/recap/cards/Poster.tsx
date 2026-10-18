import React from 'react';
import {Text, View} from 'react-native';
import {Defs, Path, Rect} from 'react-native-svg';
import {blob} from '../../../brandArt';
import {LogoMark} from '../../../components/Logo';
import {getBestArtworkUrl} from '../../../tracks';
import {type Card, Cover, duration, Grad, Layer, Rise, Spin} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function posterCard({r, week}: CardContext): Card {
  return {
    key: 'poster',
    draw: (p, h) => {
      const cells: [string, string][] = [['Songs', String(r.songs)]];
      if (r.minutes != null) {
        cells.push(['Listened', duration(r.minutes)]);
      }
      if (r.topArtist) {
        cells.push(['Top artist', r.topArtist.name]);
      }
      if (r.persona) {
        cells.push(['You are', r.persona.name]);
      }
      if (r.streak >= 2) {
        cells.push(['Streak', `${r.streak} days`]);
      }
      const ink = {color: p.ink};
      return (
        <>
          <Layer h={h}>
            <Defs>
              <Grad id="g12" from={p.a} to={p.c} />
            </Defs>
            <Rect
              x={18}
              y={92}
              width={324}
              height={h - 140}
              rx={28}
              fill="none"
              stroke="url(#g12)"
              strokeWidth={10}
            />
          </Layer>
          <Spin cx={332} cy={156} r={80}>
            <Path d={blob(332, 156, 56, 0.25, 7, 31)} fill={p.b} />
          </Spin>
          <View style={[styles.content, styles.poster]}>
            <Rise i={0}>
              <Text style={[styles.lbl, ink]}>
                {week ? 'Your week, in one picture' : 'You, in one picture'}
              </Text>
            </Rise>
            {r.topSong && (
              <Rise i={1} style={styles.li}>
                <Cover
                  uri={getBestArtworkUrl(r.topSong.track)}
                  size={84}
                  title={r.topSong.track.title}
                  pal={p}
                />
                <View style={styles.liText}>
                  <Text style={[styles.liB, ink]}>Top song</Text>
                  <Text style={[styles.posterTitle, ink]} numberOfLines={2}>
                    {r.topSong.track.title}
                  </Text>
                </View>
              </Rise>
            )}
            <Rise i={2} style={styles.grid}>
              {cells.map(([k, v]) => (
                <View key={k} style={styles.cell}>
                  <Text style={[styles.liB, ink]}>{k}</Text>
                  <Text style={[styles.cellValue, ink]} numberOfLines={2}>
                    {v}
                  </Text>
                </View>
              ))}
            </Rise>
            <View style={styles.fill} />
            <Rise i={3} style={styles.sign}>
              <LogoMark size={20} color={p.ink} />
              <Text style={[styles.signText, ink]}>Relaxify Recap</Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
