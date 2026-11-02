/**
 * While a Jam runs, a slim bar on every page says so, with how many are
 * listening, and opens the Jam. Without it a Jam was easy to forget about,
 * and the only way back to it was the side menu.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Animated, {FadeInDown, FadeOutDown} from 'react-native-reanimated';
import {BRIGHT_PALS} from '../brandArt';
import {ChevronRight} from '../icons';
import {useJam} from '../jam';
import {BOTTOM_INSET} from '../layout';
import {S} from '../theme';
import {JAM_ROOM, useUpdateStripRoom} from './UpdateModal';

export function JamBar({
  hidden,
  onOpen,
}: {
  hidden: boolean;
  onOpen: () => void;
}) {
  const jam = useJam();
  const below = useUpdateStripRoom();
  if (!jam || hidden) {
    return null;
  }
  const pal = BRIGHT_PALS[0];
  const n = jam.members.length || 1;
  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      style={[styles.dock, {bottom: BOTTOM_INSET + 10 + below}]}>
      <TouchableOpacity
        style={[styles.bar, {backgroundColor: pal.bg}]}
        onPress={onOpen}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Open the Jam, ${n} listening`}>
        <View style={[styles.dot, {backgroundColor: pal.ink}]} />
        <Text style={[styles.text, {color: pal.ink}]} numberOfLines={1}>
          {`Jam ${jam.code} · ${n} listening`}
        </Text>
        <ChevronRight size={18} color={pal.ink} strokeWidth={2.6} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: S.gutter,
    right: S.gutter,
    height: JAM_ROOM - 8,
  },
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  dot: {width: 8, height: 8, borderRadius: 4},
  text: {flex: 1, fontSize: 14, fontWeight: '700'},
});
