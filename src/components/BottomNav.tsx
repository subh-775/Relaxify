/**
 * Primary navigation — three thumb-reachable destinations, icon over label.
 *
 * Spotify's bar: a 24dp icon with its name under it. At rest both are a light
 * grey outline; the tab you are in is white and its icon fills in (Home's
 * house goes solid, Search's lens gains a dot, Library's book goes solid).
 * White, not coral: coral is for things that are on, and being on a tab is
 * where you are, not a setting.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {
  HomeGlyph,
  HomeOnGlyph,
  LibraryGlyph,
  LibraryOnGlyph,
  SearchGlyph,
  SearchOnGlyph,
  type GlyphProps,
} from '../glyphs';
import {C} from '../theme';

export type Tab = 'home' | 'search' | 'library';

type Icon = (p: GlyphProps) => React.JSX.Element;

const TABS: {id: Tab; label: string; Icon: Icon; IconOn: Icon}[] = [
  {id: 'home', label: 'Home', Icon: HomeGlyph, IconOn: HomeOnGlyph},
  {id: 'search', label: 'Search', Icon: SearchGlyph, IconOn: SearchOnGlyph},
  {
    id: 'library',
    label: 'Your Library',
    Icon: LibraryGlyph,
    IconOn: LibraryOnGlyph,
  },
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
      {/* No slab and no top border: the bar melts into the page, so content
          scrolls under the icons. BodyFade in App.tsx carries it up past the
          mini player.

          Spotify's shading: the page still shows through at the top of the
          bar, faintly, and it is near black by the labels. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="navfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bg} stopOpacity="0.55" />
            <Stop offset="0.45" stopColor={C.bg} stopOpacity="0.85" />
            <Stop offset="1" stopColor={C.bg} stopOpacity="0.97" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#navfade)" />
      </Svg>
      {TABS.map(({id, label, Icon, IconOn}) => {
        const on = active === id;
        const Shown = on ? IconOn : Icon;
        return (
          <TouchableOpacity
            key={id}
            style={styles.tab}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{selected: on}}
            onPress={() => onChange(id)}>
            <Shown size={ICON} color={on ? C.text : INACTIVE} />
            <Text
              style={[styles.label, on && styles.labelOn]}
              numberOfLines={1}
              allowFontScaling={false}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Spotify's size. The label under it carries the rest of the weight that the
// 29px icon used to carry alone.
const ICON = 24;

// Spotify's resting grey: light enough to read on the dark fade, clearly
// quieter than the white of the tab you are in.
const INACTIVE = '#B3B3B3';

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', paddingBottom: 2},
  // 8 + 24 + 4 + 13 + 8 + 2 = 59, the height the bar has always had, so the
  // mini player above it, BOTTOM_INSET and the toasts all stay put.
  tab: {flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8},
  // Fixed size (allowFontScaling off): a large system font would push the bar
  // past 59 and the mini player up with it.
  label: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: '500',
    color: INACTIVE,
  },
  labelOn: {color: C.text},
});
