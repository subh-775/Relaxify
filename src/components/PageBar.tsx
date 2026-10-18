/**
 * The bar across the top of a full page (Settings and the pages inside it,
 * Languages for music): a back arrow and the page's name, centred on the
 * screen as Spotify sets it.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ArrowLeft} from '../icons';
import {C, T} from '../theme';

export function PageBar({title, onBack}: {title: string; onBack: () => void}) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back">
        <ArrowLeft size={24} color={C.text} strokeWidth={2.2} />
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    backgroundColor: C.surface,
  },
  back: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  // Centred on the screen, not in the space beside the arrow: the right
  // margin matches the arrow's width.
  title: {
    ...T.body,
    flex: 1,
    marginRight: 44,
    textAlign: 'center',
    color: C.text,
    fontSize: 19,
    fontWeight: '700',
  },
});
