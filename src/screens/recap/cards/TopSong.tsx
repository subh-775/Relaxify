import React from 'react';
import {Text, View} from 'react-native';
import {Circle, Defs, Line, Path, Text as SvgText} from 'react-native-svg';
import {blob, sparkle} from '../../../brandArt';
import {FONT} from '../../../font';
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
  times,
  Tube,
} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function topSongCard({r, week}: CardContext): Card | null {
  if (!r.topSong) {
    return null;
  }
  const t = r.topSong.track;
  const count = r.topSong.count;
  const hotDay = r.topSongDay;
  return {
    key: 'song',
    draw: (p, h) => {
      const Y = at760(h);
      const cy = Y(392);
      const ink = {color: p.ink};
      // Monday first, as a week is read; the dot marks the day it was
      // played most.
      const order = [1, 2, 3, 4, 5, 6, 0];
      const ring = order.map((wd, i) => {
        const a = (i / 7) * 360 - 90;
        const rad = (a * Math.PI) / 180;
        const lx = 180 + Math.cos(rad) * 94;
        const ly = cy + Math.sin(rad) * 94;
        const ta = rad + Math.PI / 7;
        return (
          <React.Fragment key={wd}>
            <SvgText
              x={lx}
              y={ly + 4}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="11"
              fontWeight="800"
              fill={p.ink}
              transform={`rotate(${a + 90} ${lx} ${ly})`}>
              {DAYS[wd].slice(0, 3).toUpperCase()}
            </SvgText>
            <Line
              x1={180 + Math.cos(ta) * 84}
              y1={cy + Math.sin(ta) * 84}
              x2={180 + Math.cos(ta) * 106}
              y2={cy + Math.sin(ta) * 106}
              stroke={p.ink}
              strokeWidth={1.5}
              opacity={0.5}
            />
          </React.Fragment>
        );
      });
      const hot =
        hotDay >= 0
          ? (order.indexOf(hotDay) / 7) * Math.PI * 2 - Math.PI / 2
          : null;
      return (
        <>
          <Spin cx={180} cy={cy} r={170}>
            <Defs>
              <Grad id="g2" from={p.a} to={p.b} />
            </Defs>
            <Path d={blob(180, cy, 158, 0.2, 11, 7)} fill="url(#g2)" />
          </Spin>
          <Layer h={h}>
            <Defs>
              <Grad id="g2b" from={p.c} to={p.b} y2={0} />
            </Defs>
            <Circle cx={180} cy={cy} r={112} fill={p.bg} />
            {ring}
            {hot != null && (
              <Circle
                cx={180 + Math.cos(hot) * 124}
                cy={cy + Math.sin(hot) * 124}
                r={9}
                fill={p.ink}
              />
            )}
            <Tube
              d={`M390,${Y(196)} C320,${Y(170)} 360,${Y(262)} 286,${Y(246)}`}
              grad="g2b"
              ink={p.ink}
              w={12}
            />
            <Path d={sparkle(62, Y(250), 16)} fill={p.c} />
          </Layer>
          <View style={[styles.songCover, {top: cy - 60}]}>
            <Cover
              uri={getBestArtworkUrl(t)}
              size={120}
              title={t.title}
              pal={p}
            />
          </View>
          <View style={[styles.content, styles.center]}>
            <Rise i={0}>
              <Text style={[styles.lbl, styles.centerText, ink]}>
                {week ? 'Your song of the week' : 'Your most played song'}
              </Text>
            </Rise>
            <Rise i={1}>
              <Text
                style={[styles.h1, styles.h32, styles.centerText, ink]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.6}>
                {t.title}
              </Text>
            </Rise>
            <View style={styles.fill} />
            <Rise i={2}>
              <Text
                style={[styles.line, styles.centerText, ink]}
                numberOfLines={1}>
                {t.artist}
              </Text>
            </Rise>
            <Rise i={3}>
              <Text style={[styles.h1, styles.h30, styles.centerText, ink]}>
                {`Played ${times(count)}`}
              </Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
