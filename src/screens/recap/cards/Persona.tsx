import React from 'react';
import {Text, View} from 'react-native';
import {
  Circle,
  Defs,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import {rng} from '../../../brandArt';
import {FONT} from '../../../font';
import {hourLabel} from '../../../recap';
import {at760, type Card, Grad, Layer, Pixels, Rise, Tube} from '../art';
import type {CardContext} from './context';
import {styles} from '../styles';

export function personaCard({r, week}: CardContext): Card | null {
  if (!r.persona) {
    return null;
  }
  const persona = r.persona;
  const night =
    persona.name === 'Night owl' || persona.name === 'After-hours listener';
  return {
    key: 'hour',
    draw: (p, h) => {
      const top = at760(h)(176);
      const fh = 360;
      const cx = 180;
      const cy = top + 190;
      const max = Math.max(1, ...r.hours);
      const near = (hr: number) =>
        r.peakHour >= 0 &&
        Math.min(Math.abs(hr - r.peakHour), 24 - Math.abs(hr - r.peakHour)) <=
          1;
      const R = rng(9);
      return (
        <>
          <Layer h={h}>
            <Defs>
              <Grad id="g10" from={p.a} to={p.b} />
              <Grad
                id="g10s"
                from={night ? '#1B1446' : '#FFB36B'}
                to={night ? '#3A1A5E' : '#FF6FA8'}
                x2={0}
              />
              <Grad id="g10c" from={p.c} to={p.a} y2={0} />
            </Defs>
            <Rect
              x={52}
              y={top}
              width={256}
              height={fh}
              rx={4}
              fill="url(#g10s)"
            />
            {Array.from({length: 18}, (_, i) => (
              <Circle
                key={i}
                cx={60 + R() * 240}
                cy={top + 14 + R() * (fh - 28)}
                r={0.8 + R() * 1.8}
                fill="#fff"
                opacity={night ? 0.8 : 0.5}
              />
            ))}
            {night ? (
              <Path
                d={`M232,${top + 60} a34,34 0 1 0 22,58 a28,28 0 1 1 -22,-58Z`}
                fill={p.c}
              />
            ) : (
              <Circle cx={244} cy={top + 84} r={30} fill={p.c} />
            )}
            {r.hours.map((n, hr) => {
              const a = (hr / 24) * Math.PI * 2 - Math.PI / 2;
              const r0 = 46;
              const len = 6 + (n / max) * 40;
              return (
                <Line
                  key={hr}
                  x1={cx + Math.cos(a) * r0}
                  y1={cy + Math.sin(a) * r0}
                  x2={cx + Math.cos(a) * (r0 + len)}
                  y2={cy + Math.sin(a) * (r0 + len)}
                  stroke={near(hr) ? p.c : 'rgba(255,255,255,0.35)'}
                  strokeWidth={6}
                  strokeLinecap="round"
                />
              );
            })}
            <SvgText
              x={cx}
              y={cy + 5}
              textAnchor="middle"
              fontFamily={FONT}
              fontSize="13"
              fontWeight="800"
              fill="#fff">
              {hourLabel(r.peakHour)}
            </SvgText>
            <Rect
              x={52}
              y={top}
              width={256}
              height={fh}
              rx={4}
              fill="none"
              stroke="url(#g10)"
              strokeWidth={9}
            />
            <Pixels x={270} y={top - 26} cell={6} fill={p.a} />
            <Tube
              d={`M-20,${top - 26} C50,${top - 72} 110,${top + 20} 176,${
                top - 26
              }`}
              grad="g10c"
              ink={p.ink}
              w={10}
            />
          </Layer>
          <View
            style={[
              styles.content,
              styles.center,
              {paddingTop: top + fh + 24},
            ]}>
            <Rise i={0}>
              <Text style={[styles.lbl, styles.centerText, {color: p.ink}]}>
                {week ? 'This week you were' : 'Lately you have been'}
              </Text>
            </Rise>
            <Rise i={1}>
              <Text style={[styles.h1, styles.centerText, {color: p.ink}]}>
                {persona.name}
              </Text>
            </Rise>
            <Rise i={2}>
              <Text style={[styles.line, styles.centerText, {color: p.ink}]}>
                {persona.line}
              </Text>
            </Rise>
          </View>
        </>
      );
    },
  };
}
