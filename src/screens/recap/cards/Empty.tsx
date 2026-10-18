import React from 'react';
import {Text, View} from 'react-native';
import {Path} from 'react-native-svg';
import {blob, sparkle} from '../../../brandArt';
import {type Card, Layer, Rise, Spin} from '../art';
import {styles} from '../styles';

export function emptyCard(): Card {
  return {
    key: 'empty',
    draw: (p, h) => (
      <>
        <Spin cx={250} cy={h * 0.36} r={150}>
          <Path d={blob(250, h * 0.36, 130, 0.22, 9, 4)} fill={p.a} />
        </Spin>
        <Layer h={h}>
          <Path d={sparkle(70, h * 0.2, 18)} fill={p.c} />
        </Layer>
        <View style={[styles.content, styles.bottom]}>
          <Rise i={0}>
            <Text style={[styles.h1, {color: p.ink}]}>
              Nothing to recap yet
            </Text>
          </Rise>
          <Rise i={1}>
            <Text style={[styles.line, {color: p.ink}]}>
              Play a few songs. Each one counts once you have listened for 30
              seconds.
            </Text>
          </Rise>
        </View>
      </>
    ),
  };
}
