/**
 * The Recap, announced on Home: a card in the Recap's own colours once the
 * week has enough listening to tell a story. It is the one place the Recap is
 * seen without opening the menu, which is where a feature this good was
 * otherwise hiding.
 *
 * Shown from MIN_SONGS songs in the last seven days. The cross puts it away
 * until next week, not for good. Its palette is picked by the week, so it
 * holds still while you use the app and is different next week.
 */
import React, {useEffect, useMemo, useRef} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {S} from '../theme';
import {X} from '../icons';
import {BRIGHT_PALS, burst} from '../brandArt';
import {dayKey, summarizeWeek, useStatsState} from '../stats';
import {createStore, useStoreValue} from '../storage';

const MIN_SONGS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;
const ART = 190;
const BURST = burst(ART / 2, ART / 2, 88, 54, 12);

/** The week it was put away in, as its Monday's day key. */
const hiddenFor = createStore<string>('mp.recapTeaserHidden.v1', '', raw =>
  typeof raw === 'string' ? raw : '',
);

/** Monday of the week `at` falls in, as a day key. Exported for the test. */
export function weekOf(at: number): string {
  const back = (new Date(at).getDay() + 6) % 7;
  return dayKey(at - back * DAY_MS);
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function RecapTeaser({onOpen}: {onOpen: () => void}) {
  const stats = useStatsState();
  const hidden = useStoreValue(hiddenFor);
  const now = Date.now();
  const week = weekOf(now);
  const sum = useMemo(() => summarizeWeek(stats.log, Date.now()), [stats]);
  // Stable for the week: the Monday's date picks the palette.
  const pal = BRIGHT_PALS[Number(week.replace(/-/g, '')) % BRIGHT_PALS.length];

  const turn = useRef(new Animated.Value(0)).current;
  const show = sum.songs >= MIN_SONGS && hidden !== week;
  useEffect(() => {
    if (!show) {
      return;
    }
    const spin = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 30000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spin.start();
    return () => spin.stop();
  }, [show, turn]);

  if (!show) {
    return null;
  }
  const ink = {color: pal.ink};
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onOpen}
      style={[styles.card, {backgroundColor: pal.bg}]}
      accessibilityRole="button"
      accessibilityLabel={`Your week in music is ready: ${sum.songs} songs. Open Recap`}>
      <Animated.View
        style={[
          styles.art,
          {
            transform: [
              {
                rotate: turn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
        pointerEvents="none">
        <Svg width={ART} height={ART}>
          <Path d={BURST} fill={pal.a} />
          <Circle cx={ART / 2} cy={ART / 2} r={34} fill={pal.b} />
        </Svg>
      </Animated.View>
      <TouchableOpacity
        style={styles.close}
        hitSlop={12}
        onPress={() => hiddenFor.set(week)}
        accessibilityRole="button"
        accessibilityLabel="Hide until next week">
        <X size={18} color={pal.ink} strokeWidth={2.6} />
      </TouchableOpacity>
      <Text style={[styles.kicker, ink]}>Your week in music is ready</Text>
      <Text style={[styles.big, ink]}>
        {`${sum.songs} songs,\n${duration(sum.minutes)}`}
      </Text>
      <View style={[styles.go, {backgroundColor: pal.ink}]}>
        <Text style={[styles.goText, {color: pal.bg}]}>Open Recap</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: S.gutter,
    marginTop: 4,
    marginBottom: 18,
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
    gap: 2,
  },
  art: {position: 'absolute', right: -34, top: -38, width: ART, height: ART},
  close: {position: 'absolute', right: 12, top: 12},
  kicker: {fontSize: 13, fontWeight: '800'},
  big: {
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -1.2,
    maxWidth: '70%',
  },
  go: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  goText: {fontSize: 13.5, fontWeight: '800'},
});
