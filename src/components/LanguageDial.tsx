/**
 * Home's "Tune to another language" banner, between Charts and Top playlists.
 *
 * A radio dial: the languages, each in its own script, slide under a fixed
 * pointer, and letting go on one tunes Home and Search to it. A tap on a name
 * slides it there too. Tuning picks that ONE language; Settings still holds
 * up to three for anyone who wants a mix.
 */
import React, {useRef, useState} from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {C, S, T} from '../theme';
import {useSettings, writeSetting} from '../store';
import {LANGUAGES} from './LanguageChips';
import {logEvent} from '../analytics';

const ITEM_W = 92;
const TICKS = 9;

export function LanguageDial() {
  const current = useSettings().homeLanguages[0];
  const start = Math.max(0, LANGUAGES.findIndex(([l]) => l === current));
  const [on, setOn] = useState(start);
  const [width, setWidth] = useState(0);
  const dial = useRef<ScrollView>(null);
  const pad = Math.max(0, (width - ITEM_W) / 2);

  const tune = (x: number) => {
    const i = Math.min(LANGUAGES.length - 1, Math.max(0, Math.round(x / ITEM_W)));
    setOn(i);
    const [lang] = LANGUAGES[i];
    if (lang !== current) {
      logEvent('language_dial', {language: lang});
      writeSetting('homeLanguages', [lang]);
    }
  };

  return (
    <View style={styles.card} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <Text style={styles.title}>Tune to another language</Text>
      <Text style={styles.sub}>Slide to change the songs and the style</Text>
      {width > 0 && (
        <View>
          <ScrollView
            ref={dial}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_W}
            decelerationRate="fast"
            contentOffset={{x: start * ITEM_W, y: 0}}
            contentContainerStyle={{paddingHorizontal: pad}}
            scrollEventThrottle={32}
            onScroll={e => {
              const i = Math.round(e.nativeEvent.contentOffset.x / ITEM_W);
              if (i !== on && i >= 0 && i < LANGUAGES.length) {
                setOn(i);
              }
            }}
            onMomentumScrollEnd={e => tune(e.nativeEvent.contentOffset.x)}>
            {LANGUAGES.map(([lang, label], i) => (
              <TouchableOpacity
                key={lang}
                style={styles.item}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{selected: i === on}}
                accessibilityLabel={lang}
                onPress={() => {
                  dial.current?.scrollTo({x: i * ITEM_W, animated: true});
                  tune(i * ITEM_W);
                }}>
                <Text
                  style={[styles.lang, i === on && styles.langOn]}
                  numberOfLines={1}>
                  {label}
                </Text>
                <View style={styles.ticks}>
                  {Array.from({length: TICKS}, (_, t) => (
                    <View key={t} style={styles.tick} />
                  ))}
                </View>
              </TouchableOpacity>
            ))}
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
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: C.surfaceHi,
    overflow: 'hidden',
  },
  title: {...T.rowTitle, color: C.text, paddingHorizontal: 16},
  sub: {...T.sub, color: C.sub, paddingHorizontal: 16, marginTop: 2},
  item: {width: ITEM_W, alignItems: 'center', paddingTop: 12},
  lang: {
    color: C.faint,
    fontSize: 14,
    fontWeight: '800',
    height: 30,
    lineHeight: 30,
  },
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
  pointer: {
    position: 'absolute',
    bottom: -4,
    width: 3,
    height: 24,
    borderRadius: 2,
    backgroundColor: C.brand,
  },
});
