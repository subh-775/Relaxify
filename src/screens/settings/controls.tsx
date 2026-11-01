/**
 * The pieces Settings is built from: groups, rows, and the controls that sit in
 * them.
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import ReAnimated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {Toggle} from '../../components/Toggle';
import {ChevronLeft, ChevronRight, ExternalLink, Info} from '../../icons';
import {C, S, T, fs} from '../../theme';

/**
 * A settings group: a white heading over its rows, Spotify's way.
 *
 * No card, no hairlines. Ruled rows made the screen one long ribbon of lines;
 * a bold heading and the space around each group give it its start and end
 * instead, and the rows read as plain text.
 */
export function Section({
  title,
  Icon,
  footer,
  children,
}: {
  title: string;
  Icon?: RowIcon;
  /** One line under the card, for the explanation that would otherwise be
   *  crammed into a row's `hint`. */
  footer?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {!!Icon && <Icon size={13} color={C.faint} strokeWidth={2.6} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>
        {items.map((child, i) => (
          // child.key, not the index. These children are conditional (the
          // update row's states, the sources list), and an index key makes
          // React reuse the wrong instance when one appears or disappears —
          // component state leaks across rows. React.Children.toArray already
          // assigns stable keys; use them.
          <React.Fragment key={(child as {key?: string}).key ?? i}>
            {child}
          </React.Fragment>
        ))}
      </View>
      {!!footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

export type RowIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/** A row's leading icon, the same size and colour everywhere. */
function Lead({Icon}: {Icon?: RowIcon}) {
  return Icon ? <Icon size={19} color={C.sub} strokeWidth={2} /> : null;
}

export function Row({
  label,
  value,
  hint,
  onPress,
  Icon,
  external,
}: {
  label: string;
  value?: string;
  hint?: string;
  onPress?: () => void;
  Icon?: RowIcon;
  /** Leaves the app (a web page, the file manager): marked as such. */
  external?: boolean;
}) {
  const Wrap: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Lead Icon={Icon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {/* A row that DOES something has to look different from one that just
          reports a number. Without this, "Streaming quality — Very High" was
          indistinguishable from a read-only line, so nobody knew it opened. */}
      {!!onPress &&
        (external ? (
          <ExternalLink size={17} color={C.faint} />
        ) : (
          <ChevronRight size={17} color={C.faint} />
        ))}
    </Wrap>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  Icon,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  Icon?: RowIcon;
}) {
  return (
    <View style={styles.row}>
      <Lead Icon={Icon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </View>
  );
}

export const CROSSFADE_MAX = 12;

/** Position along the track (0..1) for a touch at `x` on a track `w` wide. */
function fracAt(x: number, w: number): number {
  'worklet';
  return Math.max(0, Math.min(1, x / (w || 1)));
}

/** The nearest step for a track position: the value only ever lands on one. */
function stepAt(f: number, max: number, step: number): number {
  'worklet';
  return Math.round((f * max) / step) * step;
}

/**
 * A horizontal bar you drag from Off up to `max` in whole steps: crossfade
 * (0–12s) and the cache limit (Off, 10–100 MB). 0 always reads as Off.
 *
 * It was a ‹‹ 9s ›› stepper because an earlier draggable bar was fiddly to land
 * on an exact second. That bar was fiddly for a reason this one does not share:
 * it ran on the JS thread, so the fill trailed the finger, and it reported a
 * continuous value the label then rounded — you could not see which second you
 * were on until you let go. Here the fill is a shared value written straight
 * from the worklet, the readout is derived from the position and crosses to JS
 * only when the WHOLE second changes, and the release snaps the fill to the
 * second it committed. Same machinery as the equalizer bands.
 *
 * The gesture is horizontal-only on purpose. Android's vertical ScrollView
 * intercepts on vertical travel past the touch slop and ignores horizontal
 * travel entirely, so activeOffsetX + failOffsetY is enough here — unlike the
 * equalizer, where the band drags along the SAME axis as its scroller and needs
 * blocksExternalGesture to stop the touch being taken.
 */
export function StepSlider({
  label,
  hint,
  value,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  step: number;
  /** The readout for a value above 0; 0 always reads as Off. */
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const secsAt = useCallback(
    (f: number) => {
      'worklet';
      return stepAt(f, max, step);
    },
    [max, step],
  );
  const t = useSharedValue(value / max);
  /** The track's real measured width, so the worklet never has to ask JS. */
  const w = useSharedValue(1);
  /** 0 at rest, 1 while held — the thumb grows under the finger. */
  const grow = useSharedValue(0);
  const [shown, setShown] = useState(Math.round(value));
  const dragging = useRef(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Follow the setting when it changes from OUTSIDE a drag (a reset, mostly).
  useEffect(() => {
    if (!dragging.current) {
      t.value = value / max;
    }
  }, [value, t, max]);

  // The readout, derived from the position rather than pushed by the gesture,
  // so it is right whoever moved the bar — and it reaches JS about twelve times
  // across a full drag instead of sixty times a second.
  useAnimatedReaction(
    () => secsAt(t.value),
    (secs, prev) => {
      if (secs !== prev) {
        runOnJS(setShown)(secs);
      }
    },
  );

  const setDragging = useCallback((on: boolean) => {
    dragging.current = on;
  }, []);
  const commit = useCallback((secs: number) => changeRef.current(secs), []);

  const gesture = useMemo(() => {
    const scrub = Gesture.Pan()
      .activeOffsetX([-4, 4])
      .failOffsetY([-14, 14])
      .onBegin(() => {
        runOnJS(setDragging)(true);
      })
      .onStart(e => {
        grow.value = withTiming(1, {duration: 120});
        t.value = fracAt(e.x, w.value);
      })
      .onUpdate(e => {
        t.value = fracAt(e.x, w.value);
      })
      .onEnd(() => {
        // Snap the FILL to the second being committed, so what is on screen and
        // what was stored are the same thing.
        const secs = secsAt(t.value);
        t.value = withTiming(secs / max, {duration: 90});
        runOnJS(commit)(secs);
      })
      .onFinalize(() => {
        grow.value = withTiming(0, {duration: 180});
        runOnJS(setDragging)(false);
      });

    // Tap to jump. A Pan cannot serve this without activating on touch-down,
    // and activating on touch-down would take every touch that was meant for
    // the page scroll.
    const jump = Gesture.Tap()
      .maxDuration(400)
      .onEnd((e, success) => {
        if (!success) {
          return;
        }
        const secs = secsAt(fracAt(e.x, w.value));
        t.value = withTiming(secs / max, {duration: 120});
        runOnJS(commit)(secs);
      });

    return Gesture.Race(scrub, jump);
  }, [grow, t, w, setDragging, commit, secsAt, max]);

  const fillStyle = useAnimatedStyle(() => ({width: `${t.value * 100}%`}));
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${t.value * 100}%`,
    transform: [{scale: 1 + grow.value * 0.3}],
  }));

  return (
    <View style={styles.slider}>
      <View style={styles.sliderHead}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowHint}>{hint}</Text>
        </View>
        <Text style={[styles.sliderValue, shown === 0 && styles.sliderOff]}>
          {shown > 0 ? format(shown) : 'Off'}
        </Text>
      </View>

      {/* ~28px visual, 44px touch (Fitts') — a 4px bar is unhittable. */}
      <GestureDetector gesture={gesture}>
        <View
          style={styles.sliderTouch}
          onLayout={e => {
            w.value = e.nativeEvent.layout.width;
          }}>
          <View style={styles.sliderTrack}>
            <ReAnimated.View style={[styles.sliderFill, fillStyle]} />
          </View>
          <ReAnimated.View
            style={[styles.sliderThumb, thumbStyle]}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>

      <View style={styles.sliderEnds}>
        <Text style={styles.sliderEnd}>Off</Text>
        <Text style={styles.sliderEnd}>{format(max)}</Text>
      </View>
    </View>
  );
}

/**
 * A size picked from a short list, with arrows either side of it, on the
 * row's own line: for the cache limit, where only a few sizes make sense and
 * a slider made you hunt for them.
 */
export function SizeStepper({
  label,
  hint,
  value,
  steps,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  /** In MB, ascending; 0 reads as Off. */
  steps: number[];
  onChange: (v: number) => void;
}) {
  const at = Math.max(0, steps.indexOf(value));
  const go = (i: number) => onChange(steps[i]);
  const arrow = (i: number, Icon: typeof ChevronLeft, name: string) => (
    <TouchableOpacity
      onPress={() => go(i)}
      disabled={i < 0 || i >= steps.length}
      hitSlop={8}
      style={[styles.stepBtn, (i < 0 || i >= steps.length) && styles.stepOff]}
      accessibilityRole="button"
      accessibilityLabel={name}>
      <Icon size={20} color={C.text} />
    </TouchableOpacity>
  );
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {arrow(at - 1, ChevronLeft, 'Smaller')}
      <Text style={[styles.sizeValue, !value && styles.sliderOff]}>
        {value ? `${value} MB` : 'Off'}
      </Text>
      {arrow(at + 1, ChevronRight, 'Bigger')}
    </View>
  );
}

export function NavRow({
  label,
  value,
  onPress,
  Icon,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  Icon?: RowIcon;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Lead Icon={Icon} />
      <Text style={[styles.rowLabel, styles.rowText]}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <ChevronRight size={18} color={C.faint} />
    </TouchableOpacity>
  );
}

/** One of the main list's categories: its icon, its name, what is inside. */
export function CategoryRow({
  Icon,
  label,
  hint,
  onPress,
}: {
  Icon: typeof Info;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.category}
      onPress={onPress}
      activeOpacity={0.7}>
      <Icon size={23} color={C.text} strokeWidth={1.8} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <ChevronRight size={18} color={C.faint} />
    </TouchableOpacity>
  );
}

/** A rounded button, outlined white as Spotify's settings have them; filled
 *  in the accent for the one thing to do now (Install). */
export function Pill({
  label,
  onPress,
  disabled,
  filled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        filled && styles.pillFilled,
        disabled && styles.pillOff,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button">
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A thing to do, said beside its button (Remove all downloads, Clear
 *  cache), one line as Spotify has it: no red, the confirmation asks first. */
export function ActionRow({
  label,
  hint,
  action,
  onPress,
  disabled,
}: {
  label: string;
  hint: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Pill label={action} onPress={onPress} disabled={disabled} />
    </View>
  );
}

const styles = StyleSheet.create({
  // No lines at all now: the heading and the space around a group are
  // what separate it.
  card: {},
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 64,
    paddingHorizontal: S.gutter,
    paddingVertical: 10,
  },
  pill: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  pillFilled: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  pillOff: {opacity: 0.4},
  pillText: {color: C.text, fontSize: 14, fontWeight: '700'},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Aligned to the page gutter now that there is no card inset to sit inside.
    paddingHorizontal: S.gutter,
    paddingVertical: 12,
    gap: 14,
  },
  rowHint: {...T.listSub, color: C.sub, marginTop: 2},
  // 15 px, Spotify's settings size: the list's 16 read heavy here.
  rowLabel: {...T.listTitle, color: C.text, fontSize: 15, lineHeight: 20},
  rowText: {flex: 1, minWidth: 0},
  rowValue: {
    fontSize: fs(14),
    fontWeight: '400',
    color: C.sub,
    flexShrink: 1,
    maxWidth: 190,
    textAlign: 'right',
  },
  section: {paddingTop: 22},
  sectionFooter: {
    ...T.sub,
    color: C.faint,
    paddingHorizontal: S.gutter,
    paddingTop: 7,
    lineHeight: 16,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: S.gutter,
    marginBottom: 2,
  },
  // A plain white heading, as Spotify's settings have: the group is named
  // in the same voice as the screen, not in small grey capitals.
  sectionTitle: {
    fontSize: fs(18),
    lineHeight: fs(24),
    fontWeight: '700',
    letterSpacing: -0.2,
    color: C.text,
  },
  sizeValue: {
    minWidth: 58,
    textAlign: 'center',
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  slider: {paddingHorizontal: S.gutter, paddingTop: 14, paddingBottom: 6},
  sliderEnd: {...T.sub, color: C.faint, fontSize: 11},
  sliderEnds: {flexDirection: 'row', justifyContent: 'space-between'},
  sliderFill: {height: '100%', backgroundColor: C.brand, borderRadius: 2},
  sliderHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 14},
  sliderOff: {color: C.faint},
  sliderThumb: {
    position: 'absolute',
    // Half the thumb's width, so it sits centred on the value.
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.brand,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 3,
  },
  sliderTouch: {justifyContent: 'center', height: 44, marginTop: 4},
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.13)',
    overflow: 'hidden',
  },
  sliderValue: {
    ...T.rowTitle,
    color: C.brand,
    fontSize: 16,
    // Tabular, or the whole row twitches sideways every time the number goes
    // from one digit to two while you are dragging.
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceHi,
  },
  stepOff: {opacity: 0.3},
});

export const rowStyles = styles;
