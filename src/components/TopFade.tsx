/**
 * The soft edge under a pinned header: the list dissolves into it as it
 * scrolls up, instead of being cut off in a hard line where the header ends.
 * The same idea as the tab bar's fade at the foot of the page.
 *
 * Zero height, drawn over the list that follows it, so the layout does not
 * move. That list starts TOP_FADE lower (its own paddingTop), so at rest
 * nothing sits under the fade and it only shows once content scrolls into it.
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {C} from '../theme';

export const TOP_FADE = 18;

export function TopFade() {
  return (
    <View style={styles.anchor} pointerEvents="none">
      <Svg style={styles.fade} width="100%" height={TOP_FADE}>
        <Defs>
          <LinearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bg} stopOpacity="0.97" />
            <Stop offset="0.4" stopColor={C.bg} stopOpacity="0.88" />
            <Stop offset="1" stopColor={C.bg} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#topfade)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex: above the list, its later sibling.
  anchor: {height: 0, zIndex: 1},
  fade: {position: 'absolute', left: 0, right: 0, top: 0, height: TOP_FADE},
});
