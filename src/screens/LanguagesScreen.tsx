/**
 * Languages for music: the languages Home and Browse are drawn from, one row
 * and one switch each, as Spotify lays it out. Opened from Settings and from
 * the menu.
 *
 * At most MAX_LANGUAGES: once that many are on, the rest freeze (dimmed, and
 * their switches do nothing) until one is turned off. The last one on can't be
 * turned off either, so Home always has a language to draw from.
 */
import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {C, S, T} from '../theme';
import {PageBar} from '../components/PageBar';
import {Toggle} from '../components/Toggle';
import {LANGUAGES, languageLabel} from '../languages';
import {MAX_LANGUAGES, useSettings, writeSetting} from '../store';
import {BOTTOM_INSET} from '../layout';

export function LanguagesScreen({onClose}: {onClose: () => void}) {
  const on = useSettings().homeLanguages;
  const full = on.length >= MAX_LANGUAGES;

  return (
    <View style={styles.wrap}>
      <PageBar title="Languages for music" onBack={onClose} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}>
        <Text style={styles.ask}>
          What are your preferred languages for music?
        </Text>
        <Text style={styles.status}>
          {full
            ? 'Two picked. Turn one off to choose another.'
            : 'Pick up to two.'}
        </Text>

        {LANGUAGES.map(([l]) => {
          const sel = on.includes(l);
          const frozen = full && !sel;
          const locked = frozen || (sel && on.length === 1);
          const flip = () =>
            writeSetting(
              'homeLanguages',
              sel ? on.filter(x => x !== l) : [...on, l],
            );
          return (
            <Pressable
              key={l}
              onPress={flip}
              disabled={locked}
              android_ripple={null}
              style={[styles.row, frozen && styles.frozen]}
              accessibilityRole="switch"
              accessibilityLabel={languageLabel(l)}
              accessibilityState={{checked: sel, disabled: locked}}>
              <Text style={styles.name}>{languageLabel(l)}</Text>
              <View pointerEvents="none">
                <Toggle value={sel} onChange={flip} />
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.foot}>
          Home and Browse are drawn from these. Search always covers every
          language.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  scroll: {paddingBottom: BOTTOM_INSET},
  ask: {
    color: C.text,
    fontSize: 14.5,
    paddingHorizontal: S.gutter,
    paddingTop: 18,
  },
  status: {
    color: C.sub,
    fontSize: 13,
    paddingHorizontal: S.gutter,
    paddingTop: 4,
    paddingBottom: 10,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.gutter,
  },
  frozen: {opacity: 0.35},
  name: {...T.listTitle, color: C.text, fontSize: 15, lineHeight: 20},
  foot: {
    color: C.sub,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: S.gutter,
    paddingTop: 14,
  },
});
