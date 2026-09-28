/**
 * The app's mark at the top-left of every tab — and the menu button.
 *
 * It opens the drawer, which carries the same mark at its top, so the tap
 * lands where it points. One component for all three tabs, so the mark, its
 * size and the update dot cannot drift apart between Home, Search and Library.
 */
import React from 'react';
import {StyleSheet, TouchableOpacity, View} from 'react-native';
import {C} from '../theme';
import {useUpdateAvailable} from '../update';

import {LogoMark} from './Logo';

export const MenuMark = React.memo(function MenuMark({
  onPress,
}: {
  onPress: () => void;
}) {
  const updateWaiting = useUpdateAvailable();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Open menu">
      <LogoMark size={38} />
      {/* A waiting update has to stay findable after the popup is dismissed —
          this is the only thing that says so. */}
      {updateWaiting && (
        <View
          style={styles.dot}
          accessibilityLabel="Update available"
          accessible
        />
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.accent,
    borderWidth: 1.5,
    borderColor: C.bg,
  },
});
