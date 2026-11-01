/**
 * The bar across the top of a plain page (Jam, the legal pages): a back chevron
 * and the page's name, set to the left.
 */
import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ChevronLeft} from '../icons';
import {C, T} from '../theme';

export function TitleBar({title, onBack}: {title: string; onBack: () => void}) {
  return (
    <View style={styles.bar}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel="Back">
        <ChevronLeft size={28} color={C.text} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  back: {padding: 4},
  title: {...T.screenTitle, color: C.text, fontSize: 22},
});
