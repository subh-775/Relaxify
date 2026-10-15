/**
 * Primary navigation — three thumb-reachable destinations, icon over label.
 *
 * Spotify's bar: a 24dp icon with its name under it. At rest both are a light
 * grey outline; the tab you are in is white and its icon fills in (Home's
 * house goes solid, Search's lens gains a dot, Library's book goes solid).
 * White, not coral: coral is for things that are on, and being on a tab is
 * where you are, not a setting.
 */
import React, {useRef} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
          bar, faintly, and it is solid black by the labels. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="navfade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.bg} stopOpacity="0.55" />
            <Stop offset="0.4" stopColor={C.bg} stopOpacity="0.85" />
            <Stop offset="0.7" stopColor={C.bg} stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#navfade)" />
      </Svg>
      {/* The foot of the bar is a plain View, not part of the gradient. The
          gradient used to end at 97%, and an SVG can be drawn a pixel short
          of its frame, so the page showed through in its own colours along
          the very bottom edge, as if the bar were not quite on it. A View
          fills its frame exactly, so the bar now meets the bottom of the
          screen in solid black. */}
      <View style={styles.foot} pointerEvents="none" />
      {TABS.map(({id, label, Icon, IconOn}) => (
        <TabButton
          key={id}
          label={label}
          Icon={active === id ? IconOn : Icon}
          on={active === id}
          onPress={() => onChange(id)}
        />
      ))}
    </View>
  );
}

/**
 * One tab: the icon and its label shrink together under the finger and spring
 * back, as Spotify's do.
 *
 * The shrink always plays in full. A quick tap lifts the finger a few
 * milliseconds after it lands, and easing back from wherever the shrink had
 * got to would show nothing; so the way back waits for the shrink to finish
 * and then overshoots a touch, which is what makes it read as a press.
 */
function TabButton({
  label,
  Icon,
  on,
  onPress,
}: {
  label: string;
  Icon: Icon;
  on: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const downAt = useRef(0);
  const pressed = useAnimatedStyle(() => ({
    transform: [{scale: scale.value}],
  }));
  return (
    <Pressable
      style={styles.tab}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected: on}}
      onPressIn={() => {
        downAt.current = Date.now();
        scale.value = withTiming(PRESSED, {
          duration: SHRINK_MS,
          easing: Easing.out(Easing.quad),
        });
      }}
      onPressOut={() => {
        const left = Math.max(0, SHRINK_MS - (Date.now() - downAt.current));
        scale.value = withDelay(left, withSpring(1, SPRING));
      }}
      onPress={onPress}>
      <Animated.View style={[styles.tabInner, pressed]}>
        <Icon size={ICON} color={on ? C.text : INACTIVE} />
        <Text
          style={[styles.label, on && styles.labelOn]}
          numberOfLines={1}
          allowFontScaling={false}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/** How small a tab gets under the finger, and how fast. */
const PRESSED = 0.86;
const SHRINK_MS = 90;
/** Back to full size with a small overshoot. */
const SPRING = {damping: 14, stiffness: 420, mass: 0.6};

// Spotify's size. The label under it carries the rest of the weight that the
// 29px icon used to carry alone.
const ICON = 24;

// Spotify's resting grey: light enough to read on the dark fade, clearly
// quieter than the white of the tab you are in.
const INACTIVE = '#B3B3B3';

// The lowest 30% of the 59px bar: from the gradient's last stop down.
const FOOT = 18;

const styles = StyleSheet.create({
  bar: {flexDirection: 'row', paddingBottom: 2},
  // The labels' strip down to the bottom edge, where the gradient is solid.
  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: FOOT,
    backgroundColor: C.bg,
  },
  // 8 + 24 + 4 + 13 + 8 + 2 = 59, the height the bar has always had, so the
  // mini player above it, BOTTOM_INSET and the toasts all stay put.
  tab: {flex: 1, alignItems: 'center', paddingVertical: 8},
  tabInner: {alignItems: 'center', gap: 4},
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
