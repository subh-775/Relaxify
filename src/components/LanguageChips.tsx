/**
 * The languages Home and Browse are drawn from, as chips to tap on and off.
 * Used on the welcome screen and in Settings; at least one always stays on.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {C} from '../theme';
import {useSettings, writeSetting} from '../store';

/** JioSaavn's catalogue languages, the ones most people pick first. */
export const LANGUAGES = [
  'hindi',
  'english',
  'punjabi',
  'tamil',
  'telugu',
  'marathi',
  'gujarati',
  'bengali',
  'kannada',
  'malayalam',
  'bhojpuri',
  'urdu',
  'haryanvi',
  'rajasthani',
  'odia',
  'assamese',
];

export const languageName = (l: string) => l.charAt(0).toUpperCase() + l.slice(1);

/** "Hindi, English", for a row's value. */
export const languagesLabel = (ls: string[]) => ls.map(languageName).join(', ');

export function LanguageChips() {
  const on = useSettings().homeLanguages;
  const toggle = (l: string) => {
    const next = on.includes(l) ? on.filter(x => x !== l) : [...on, l];
    if (next.length) {
      writeSetting('homeLanguages', next);
    }
  };
  return (
    <View style={styles.wrap}>
      {LANGUAGES.map(l => {
        const sel = on.includes(l);
        return (
          <TouchableOpacity
            key={l}
            onPress={() => toggle(l)}
            activeOpacity={0.8}
            style={[styles.chip, sel && styles.chipOn]}
            accessibilityRole="checkbox"
            accessibilityState={{checked: sel}}>
            <Text style={[styles.text, sel && styles.textOn]}>{languageName(l)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: C.surfaceHi,
  },
  chipOn: {backgroundColor: C.accent},
  text: {color: C.text, fontSize: 14, fontWeight: '700'},
  textOn: {color: C.bg},
});
