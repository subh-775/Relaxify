/**
 * The languages Home and Browse are drawn from, as tiles to tap on and off.
 * Used on the welcome screen and in Settings.
 *
 * At most MAX_LANGUAGES: with every language on, Home is a blur of all of
 * them. At the limit the rest dim, and tapping one says to unpick one first.
 * At least one always stays on. Each tile shows the language in its own
 * script, the English name under it.
 */
import React, {useRef, useState} from 'react';
import {Animated, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Check} from '../icons';
import {C} from '../theme';
import {MAX_LANGUAGES, useSettings, writeSetting} from '../store';

/** JioSaavn's catalogue languages, the ones most people pick first. */
const LANGUAGES: [string, string][] = [
  ['hindi', 'हिन्दी'],
  ['english', 'English'],
  ['punjabi', 'ਪੰਜਾਬੀ'],
  ['tamil', 'தமிழ்'],
  ['telugu', 'తెలుగు'],
  ['marathi', 'मराठी'],
  ['gujarati', 'ગુજરાતી'],
  ['bengali', 'বাংলা'],
  ['kannada', 'ಕನ್ನಡ'],
  ['malayalam', 'മലയാളം'],
  ['bhojpuri', 'भोजपुरी'],
  ['urdu', 'اردو'],
  ['haryanvi', 'हरियाणवी'],
  ['rajasthani', 'राजस्थानी'],
  ['odia', 'ଓଡ଼ିଆ'],
  ['assamese', 'অসমীয়া'],
];

export const languageName = (l: string) => l.charAt(0).toUpperCase() + l.slice(1);

/** "Hindi, English", for a row's value. */
export const languagesLabel = (ls: string[]) => ls.map(languageName).join(', ');

export function LanguageChips() {
  const on = useSettings().homeLanguages;
  const [hint, setHint] = useState('');
  const shake = useRef(new Animated.Value(0)).current;
  const full = on.length >= MAX_LANGUAGES;

  const nudge = () => {
    shake.setValue(0);
    Animated.sequence(
      [6, -6, 4, 0].map(x =>
        Animated.timing(shake, {toValue: x, duration: 60, useNativeDriver: true}),
      ),
    ).start();
  };

  const toggle = (l: string) => {
    if (on.includes(l)) {
      if (on.length === 1) {
        setHint('Keep at least one language.');
        return;
      }
      writeSetting('homeLanguages', on.filter(x => x !== l));
    } else if (full) {
      setHint(`That's ${MAX_LANGUAGES}. Unpick one first.`);
      nudge();
      return;
    } else {
      writeSetting('homeLanguages', [...on, l]);
    }
    setHint('');
  };

  return (
    <View>
      <Animated.View style={[styles.count, {transform: [{translateX: shake}]}]}>
        <View style={styles.dots}>
          {Array.from({length: MAX_LANGUAGES}, (_, i) => (
            <View key={i} style={[styles.dot, i < on.length && styles.dotOn]} />
          ))}
        </View>
        <Text style={styles.countText}>{`${on.length} of ${MAX_LANGUAGES} picked`}</Text>
      </Animated.View>
      <View style={styles.grid}>
        {LANGUAGES.map(([l, native]) => {
          const sel = on.includes(l);
          return (
            <TouchableOpacity
              key={l}
              onPress={() => toggle(l)}
              activeOpacity={0.8}
              style={[styles.tile, sel && styles.tileOn, full && !sel && styles.tileFull]}
              accessibilityRole="checkbox"
              accessibilityLabel={languageName(l)}
              accessibilityState={{checked: sel}}>
              <Text style={[styles.native, sel && styles.inkOn]} numberOfLines={1}>
                {native}
              </Text>
              <Text style={[styles.english, sel && styles.subOn]} numberOfLines={1}>
                {l === 'english' ? 'Worldwide' : languageName(l)}
              </Text>
              {sel && (
                <View style={styles.tick}>
                  <Check size={10} color={C.text} strokeWidth={4} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.hint} accessibilityLiveRegion="polite">
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  count: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: C.surfaceHi,
  },
  dots: {flexDirection: 'row', gap: 4},
  dot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#3a3a40'},
  dotOn: {backgroundColor: C.text},
  countText: {color: C.text, fontSize: 12.5, fontWeight: '800'},
  // Three to a row: all sixteen fit on the welcome page and in the sheet
  // without scrolling.
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14},
  tile: {
    width: '31.6%',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C.surface,
  },
  tileOn: {backgroundColor: C.text},
  tileFull: {opacity: 0.38},
  native: {color: C.text, fontSize: 15, fontWeight: '700'},
  english: {color: C.sub, fontSize: 11, fontWeight: '700', marginTop: 1},
  inkOn: {color: C.bg},
  subOn: {color: '#555'},
  tick: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {color: '#FFB38A', fontSize: 12.5, fontWeight: '700', marginTop: 10, minHeight: 17},
});
