/**
 * Primary navigation — three thumb-reachable destinations, icons only.
 *
 * Active is the same glyph FILLED, in white, with a small coral dot under it
 * (C.brand, the logo's red); at rest it is a grey outline. Each tab's solid
 * twin keeps its outline's silhouette (the house keeps its door, the lens only
 * gets heavier), so it reads as the same icon switched on rather than a
 * different one. No label: the filled icon and the dot are the whole signal.
 */
import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import Animated, {ZoomIn} from 'react-native-reanimated';
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
            {/* Mounted only under the active tab, so a tap remounts it there
                and it pops in rather than sliding across from the old tab. */}
            {on && (
              <Animated.View
                entering={ZoomIn.duration(180)}
                style={styles.dot}
              />
            )}
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

// Brighter than C.faint: with no label beside it, a resting icon has to be
// readable on its own.
const INACTIVE = '#7A7F8A';

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', paddingBottom: 2},
  // 29 + 2 × 14 + 2 = 59, the height the labelled bar had (8 + 23 + 4 + a
  // 13px label + 8 + 2), so the mini player and toasts stay where they were.
  tab: {flex: 1, alignItems: 'center', paddingVertical: PAD},
  // Out of flow so the bar keeps its 59px: 5px under the icon, in the bottom
  // padding.
  dot: {
    position: 'absolute',
    top: PAD + ICON + 5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.brand,
  },
});
