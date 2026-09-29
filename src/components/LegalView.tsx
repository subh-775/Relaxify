/**
 * Terms of Use or Privacy, read inside the app: a plain dark page with the
 * statement from legal.ts, the same text the docs site shows at /terms and
 * /privacy. Opened from Settings > About and support.
 */
import React from 'react';
import {ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ChevronLeft} from '../icons';
import {C, S, T} from '../theme';
import {BOTTOM_INSET} from '../layout';
import {CREDITS, LEGAL_UPDATED, boldRuns, type LegalDoc} from '../legal';

/** A string with **bold** runs. */
function Rich({text, style}: {text: string; style: object | object[]}) {
  return (
    <Text style={style}>
      {boldRuns(text).map((r, i) =>
        r.bold ? (
          <Text key={i} style={styles.bold}>
            {r.text}
          </Text>
        ) : (
          r.text
        ),
      )}
    </Text>
  );
}

export function LegalView({doc, onBack}: {doc: LegalDoc; onBack: () => void}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <ChevronLeft size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.barTitle}>{doc.title}</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        overScrollMode="never">
        <Text style={styles.updated}>{`Last updated ${LEGAL_UPDATED}`}</Text>
        <Text style={styles.intro}>{doc.intro}</Text>
        {doc.sections.map(s => (
          <View key={s.heading}>
            <Text style={styles.heading} accessibilityRole="header">
              {s.heading}
            </Text>
            {s.paras?.map(p => (
              <Rich key={p} text={p} style={styles.para} />
            ))}
            {s.list?.map(l => (
              <View key={l} style={styles.item}>
                <Text style={styles.dot}>•</Text>
                <Rich text={l} style={[styles.para, styles.itemText]} />
              </View>
            ))}
          </View>
        ))}
        <Text style={styles.credit}>{CREDITS}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  back: {padding: 4},
  barTitle: {...T.screenTitle, color: C.text, fontSize: 22},
  body: {paddingHorizontal: S.gutter + 4, paddingTop: 8, paddingBottom: BOTTOM_INSET + 24},
  updated: {color: C.faint, fontSize: 12.5, fontWeight: '600'},
  intro: {color: C.text, fontSize: 15, lineHeight: 23, fontWeight: '600', marginTop: 10},
  heading: {color: C.text, fontSize: 15.5, fontWeight: '800', marginTop: 24},
  para: {color: '#d6d8de', fontSize: 14, lineHeight: 22, marginTop: 6},
  bold: {color: C.text, fontWeight: '700'},
  item: {flexDirection: 'row', gap: 8, paddingLeft: 4},
  dot: {color: C.faint, fontSize: 14, lineHeight: 22, marginTop: 6},
  itemText: {flex: 1},
  credit: {
    color: C.faint,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: 28,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
});
