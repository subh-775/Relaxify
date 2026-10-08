/**
 * Home's "Tune to your taste" banner, between Charts and Top playlists.
 *
 * Two boxes at the top right, the first and the second language. Tap a box
 * and the dial below sets that one: the languages, each in its own script,
 * slide under a fixed pointer, and letting go on one (or tapping it) picks
 * it. An empty second box means one language; the × on a filled one empties
 * it. No note pops up: the boxes already say what Home plays.
 */
import React, {useEffect, useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {C, S, T} from '../theme';
import {readSettings, setSlot, useSettings, writeSetting} from '../store';
import {LANGUAGES, languageName} from './LanguageChips';
import {logEvent} from '../analytics';

const ITEM_W = 92;
const TICKS = 9;

const indexOf = (lang?: string) => LANGUAGES.findIndex(([l]) => l === lang);

export function LanguageDial() {
  const pair = useSettings().homeLanguages.slice(0, 2);
  /** The box the dial is setting: 0 = first language, 1 = second. */
  const [slot, setSlotOn] = useState<0 | 1>(0);
  // An empty second box sits the dial on the first language until a slide.
  const target = Math.max(0, indexOf(pair[slot] ?? pair[0]));
  const other = indexOf(pair[slot === 0 ? 1 : 0]);
  const [on, setOn] = useState(target);
  const [width, setWidth] = useState(0);
  const dial = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pad = Math.max(0, (width - ITEM_W) / 2);

  // To the chosen box's language: on a box tap, and after a change made
  // elsewhere (Settings, the welcome).
  useEffect(() => {
    setOn(target);
    dial.current?.scrollTo({x: target * ITEM_W, animated: true});
  }, [target]);

  // The live setting, not this render's copy: a tap's slide can end after
  // the tap already saved.
  const save = (next: string[]) => {
    const live = readSettings().homeLanguages.slice(0, 2);
    if (next.join() === live.join()) {
      return;
    }
    logEvent('language_dial', {languages: next.join(',')});
    writeSetting('homeLanguages', next);
  };

  const tuneTo = (i: number) => {
    const k = Math.min(LANGUAGES.length - 1, Math.max(0, i));
    setOn(k);
    save(setSlot(readSettings().homeLanguages.slice(0, 2), slot, LANGUAGES[k][0]));
  };

  const tap = (i: number) => {
    dial.current?.scrollTo({x: i * ITEM_W, animated: true});
    tuneTo(i);
  };

  const clearSecond = () => {
    setSlotOn(0);
    save(readSettings().homeLanguages.slice(0, 1));
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

  const box = (s: 0 | 1) => {
    const lang = pair[s];
    const chosen = slot === s;
    return (
      <TouchableOpacity
        style={[styles.box, chosen && (s === 0 ? styles.boxOn : styles.boxOn2)]}
        activeOpacity={0.75}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{selected: chosen}}
        accessibilityLabel={
          lang
            ? `${s === 0 ? 'First' : 'Second'} language, ${languageName(lang)}. Tap to change it with the dial`
            : 'Add a second language'
        }
        onPress={() => setSlotOn(s)}>
        <Text
          style={[
            styles.boxText,
            lang ? (s === 0 ? styles.first : styles.second) : styles.add,
          ]}
          numberOfLines={1}>
          {lang ? languageName(lang) : '+ Add'}
        </Text>
        {s === 1 && !!lang && (
          <TouchableOpacity
            onPress={clearSecond}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${languageName(lang)}`}>
            <Text style={styles.clear}>×</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View
      style={styles.card}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.title}>Tune to your taste</Text>
          <Text style={styles.sub}>Select your style</Text>
        </View>
        <View style={styles.boxes}>
          {box(0)}
          <Text style={styles.plus}>+</Text>
          {box(1)}
        </View>
      </View>
      {width > 0 && (
        <View>
          <ScrollView
            ref={dial}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_W}
            decelerationRate="fast"
            contentOffset={{x: target * ITEM_W, y: 0}}
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
              const isOther = i === other && i !== on;
              return (
                <TouchableOpacity
                  key={lang}
                  style={styles.item}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{selected: i === on}}
                  accessibilityLabel={languageName(lang)}
                  onPress={() => tap(i)}>
                  <Text
                    style={[
                      styles.lang,
                      isOther && styles.langOther,
                      i === on && (slot === 0 ? styles.langOn : styles.langOn2),
                    ]}
                    numberOfLines={1}>
                    {label}
                  </Text>
                  <View style={styles.ticks}>
                    {Array.from({length: TICKS}, (_, t) => (
                      <View key={t} style={styles.tick} />
                    ))}
                  </View>
                  {isOther && <View style={styles.dot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View
            pointerEvents="none"
            style={[
              styles.pointer,
              slot === 1 && styles.pointer2,
              {left: width / 2 - 1.5},
            ]}
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
  boxes: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 104,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  boxOn: {borderColor: C.brand},
  boxOn2: {borderColor: C.tone},
  boxText: {fontSize: 12.5, fontWeight: '800', flexShrink: 1},
  first: {color: C.brand},
  second: {color: C.tone},
  add: {color: C.faint},
  clear: {color: C.sub, fontSize: 15, fontWeight: '800', lineHeight: 16},
  plus: {color: C.faint, fontSize: 12, fontWeight: '800'},
  item: {width: ITEM_W, alignItems: 'center', paddingTop: 12},
  lang: {
    color: C.faint,
    fontSize: 14,
    fontWeight: '800',
    height: 30,
    lineHeight: 30,
  },
  langOther: {color: C.sub, fontSize: 16},
  langOn: {color: C.brand, fontSize: 22},
  langOn2: {color: C.tone, fontSize: 22},
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
    backgroundColor: C.sub,
  },
  pointer: {
    position: 'absolute',
    bottom: -4,
    width: 3,
    height: 24,
    borderRadius: 2,
    backgroundColor: C.brand,
  },
  pointer2: {backgroundColor: C.tone},
});
