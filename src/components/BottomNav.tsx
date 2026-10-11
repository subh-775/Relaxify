/**
 * Primary navigation — three thumb-reachable destinations, icons only.
 *
 * Active state is white with a BOLDER stroke, not a filled glyph — a solid
 * blob reads as a different icon rather than the same one selected. No dot,
 * no label: the white icon is the whole signal.
 */
import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {Home, Search, Library} from '../icons';
import {C} from '../theme';

export type Tab = 'home' | 'search' | 'library';

const TABS: {id: Tab; label: string; Icon: typeof Home}[] = [
  {id: 'home', label: 'Home', Icon: Home},
  {id: 'search', label: 'Search', Icon: Search},
  {id: 'library', label: 'Your Library', Icon: Library},
];

export function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <View style={styles.bar}>
      {/* No slab and no top border: the bar melts into the page, transparent
          at its top edge and near-black at the bottom, so content scrolls
          under the icons. BodyFade in App.tsx carries it up past the bar. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="navfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bg} stopOpacity="0" />
            <Stop offset="0.45" stopColor={C.bg} stopOpacity="0.88" />
            <Stop offset="1" stopColor={C.bg} stopOpacity="0.97" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#navfade)" />
      </Svg>
      {TABS.map(({id, label, Icon}) => {
        const on = active === id;
        return (
          <TouchableOpacity
            key={id}
            style={styles.tab}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{selected: on}}
            onPress={() => onChange(id)}>
            <Icon
              size={25}
              strokeWidth={on ? 2.4 : 2}
              color={on ? C.text : INACTIVE}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Brighter than C.faint: with no label beside it, a resting icon has to be
// readable on its own.
const INACTIVE = '#7A7F8A';

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', paddingBottom: 2},
  // 25 + 2 × 16 + 2 = 59, the height the labelled bar had (8 + 23 + 4 + a
  // 13px label + 8 + 2), so the mini player and toasts stay where they were.
  tab: {flex: 1, alignItems: 'center', paddingVertical: 16},
});
