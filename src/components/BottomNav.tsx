/**
 * Primary navigation — three thumb-reachable destinations, icons only.
 *
 * Spotify's footer: grey outlines at rest; the selected tab turns bright white
 * and fills in (Search, which cannot fill without turning into a disc, gains a
 * circle inside its lens). Nothing coral here — no dot, no tint — so the bar
 * reads as plain navigation and the colour stays for things that are ON.
 */
import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {Home, Search, Library, type IconComponent} from '../icons';
import {C} from '../theme';

export type Tab = 'home' | 'search' | 'library';

const TABS: {id: Tab; label: string; Icon: IconComponent}[] = [
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
          at its top edge and darkest at the bottom, so content scrolls under
          the icons. BodyFade in App.tsx carries it up past the bar.

          Lighter than it was (0.88 / 0.97): at nearly full black the strip
          under the mini player read as a solid band, not a fade. The page
          now shows through it faintly; the icons stay readable on it. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="navfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bg} stopOpacity="0" />
            <Stop offset="0.45" stopColor={C.bg} stopOpacity="0.72" />
            <Stop offset="1" stopColor={C.bg} stopOpacity="0.86" />
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
            <Icon size={ICON} solid={on} color={on ? C.text : INACTIVE} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// 29, up from 25: Spotify's bar pairs a ~24dp icon with a label under it, and
// with no label here the icon alone has to carry the same weight under the
// thumb.
const ICON = 29;
// The bar stays 59px: what the icon gained comes out of the padding.
const PAD = 16 - (ICON - 25) / 2;

// A light neutral grey, as Spotify's resting tabs: readable on its own with no
// label beside it, and still clearly below the selected tab's pure white.
const INACTIVE = '#A7A7A7';

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', paddingBottom: 2},
  // 29 + 2 × 14 + 2 = 59, the height the labelled bar had (8 + 23 + 4 + a
  // 13px label + 8 + 2), so the mini player and toasts stay where they were.
  tab: {flex: 1, alignItems: 'center', paddingVertical: PAD},
});
