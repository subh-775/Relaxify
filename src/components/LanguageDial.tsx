/**
 * Home's "Tune to your taste" banner, between Charts and Top playlists.
 *
 * A radio dial that keeps your last two stations. The languages, each in its
 * own script, slide under a fixed pointer; letting go on one (or tapping it)
 * tunes Home and Search to it, and the one you were on stays as the second,
 * marked with a blush dot. Tune to a third and the older one drops off; tap
 * the dotted one to keep just one. The header always reads out the pair, and
 * a note confirms each change, so the state is never a guess.
 */
import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {C, S, T} from '../theme';
import {readSettings, retune, useSettings, writeSetting} from '../store';
import {LANGUAGES, languageName} from './LanguageChips';
import {logEvent} from '../analytics';
import {toast} from '../toast';

const ITEM_W = 92;
const TICKS = 9;

const indexOf = (lang?: string) => LANGUAGES.findIndex(([l]) => l === lang);
const said = (pair: string[]) => pair.map(languageName).join(' + ');

export function LanguageDial() {
  const pair = useSettings().homeLanguages.slice(0, 2);
  const first = Math.max(0, indexOf(pair[0]));
  const second = indexOf(pair[1]);
  const [on, setOn] = useState(first);
  const [width, setWidth] = useState(0);
  const dial = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pad = Math.max(0, (width - ITEM_W) / 2);

  // Follow a change made elsewhere (Settings, the welcome).
  useEffect(() => {
    setOn(first);
    dial.current?.scrollTo({x: first * ITEM_W, animated: false});
  }, [first]);

  // The live setting, not this render's copy: a tap's slide can end after
  // the tap already saved, and must not save (and announce) it twice.
  const live = () => readSettings().homeLanguages.slice(0, 2);

  const save = (next: string[]) => {
    if (next.join() === live().join()) {
      return;
    }
    logEvent('language_dial', {languages: next.join(',')});
    writeSetting('homeLanguages', next);
    toast(`Home: ${said(next)}`);
  };

  const tuneTo = (i: number) => {
    const k = Math.min(LANGUAGES.length - 1, Math.max(0, i));
    setOn(k);
    save(retune(live(), LANGUAGES[k][0]));
  };

  const tap = (i: number) => {
    if (i === second) {
      // The dotted one: drop it, keep just the one on the pointer.
      save(live().slice(0, 1));
      return;
    }
    dial.current?.scrollTo({x: i * ITEM_W, animated: true});
    tuneTo(i);
  };

  // A slow drag ends with no fling, and Android then sends no momentum end:
  // settle on the drag's end too, unless a fling takes over.
  const endAt = (x: number) => {
    if (settle.current) {
      clearTimeout(settle.current);
    }
    settle.current = setTimeout(() => tuneTo(Math.round(x / ITEM_W)), 250);
  };
  const cancelSettle = () => {
    if (settle.current) {
      clearTimeout(settle.current);
      settle.current = null;
    }
  };
  useEffect(() => cancelSettle, []);

  return (
    <View
      style={styles.card}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>Tune to your taste</Text>
          <Text style={styles.sub}>Select your style</Text>
        </View>
        <Text
          style={styles.pair}
          numberOfLines={1}
          accessibilityLabel={`Home plays ${said(pair)}`}>
          <Text style={styles.pairFirst}>{languageName(pair[0] ?? '')}</Text>
          {pair[1] ? (
            <Text style={styles.pairSecond}>{` + ${languageName(pair[1])}`}</Text>
          ) : null}
        </Text>
      </View>
      {width > 0 && (
        <View>
          <ScrollView
            ref={dial}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_W}
            decelerationRate="fast"
            contentOffset={{x: first * ITEM_W, y: 0}}
            contentContainerStyle={{paddingHorizontal: pad}}
            scrollEventThrottle={32}
            onScroll={e => {
              const i = Math.round(e.nativeEvent.contentOffset.x / ITEM_W);
              if (i !== on && i >= 0 && i < LANGUAGES.length) {
                setOn(i);
              }
            }}
            onScrollBeginDrag={cancelSettle}
            onScrollEndDrag={e => endAt(e.nativeEvent.contentOffset.x)}
            onMomentumScrollBegin={cancelSettle}
            onMomentumScrollEnd={e =>
              tuneTo(Math.round(e.nativeEvent.contentOffset.x / ITEM_W))
            }>
            {LANGUAGES.map(([lang, label], i) => {
              const isSecond = i === second && i !== on;
              return (
                <TouchableOpacity
                  key={lang}
                  style={styles.item}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{selected: i === on || isSecond}}
                  accessibilityLabel={
                    isSecond
                      ? `${languageName(lang)}, second language. Tap to remove`
                      : languageName(lang)
                  }
                  onPress={() => tap(i)}>
                  <Text
                    style={[
                      styles.lang,
                      isSecond && styles.langSecond,
                      i === on && styles.langOn,
                    ]}
                    numberOfLines={1}>
                    {label}
                  </Text>
                  <View style={styles.ticks}>
                    {Array.from({length: TICKS}, (_, t) => (
                      <View key={t} style={styles.tick} />
                    ))}
                  </View>
                  {isSecond && <View style={styles.dot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[styles.pointer, {left: width / 2 - 1.5}]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 22,
    marginHorizontal: S.gutter,
    paddingTop: 14,
    paddingBottom: 18,
    borderRadius: 16,
    backgroundColor: C.surfaceHi,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
  },
  headText: {flexShrink: 0},
  title: {...T.rowTitle, color: C.text},
  sub: {...T.sub, color: C.sub, marginTop: 2},
  pair: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12.5,
    fontWeight: '800',
    marginTop: 4,
  },
  pairFirst: {color: C.brand},
  pairSecond: {color: C.tone},
  item: {width: ITEM_W, alignItems: 'center', paddingTop: 12},
  lang: {
    color: C.faint,
    fontSize: 14,
    fontWeight: '800',
    height: 30,
    lineHeight: 30,
  },
  langSecond: {color: C.tone, fontSize: 17},
  langOn: {color: C.brand, fontSize: 22},
  ticks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    height: 12,
    marginTop: 6,
    borderBottomWidth: 2,
    borderBottomColor: '#444',
  },
  tick: {width: 2, height: 12, backgroundColor: '#444'},
  dot: {
    position: 'absolute',
    bottom: -10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.tone,
  },
  pointer: {
    position: 'absolute',
    bottom: -4,
    width: 3,
    height: 24,
    borderRadius: 2,
    backgroundColor: C.brand,
  },
});
