/**
 * What an empty list shows: a small drawing in the Recap's style, one plain
 * line on what goes here, and, when there is one, a button that does it.
 */
import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {C} from '../theme';
import {FLOWER, blob} from '../brandArt';
import {useAccent} from '../accent';

export function EmptyState({
  title,
  line,
  action,
  onAction,
}: {
  title: string;
  line: string;
  action?: string;
  onAction?: () => void;
}) {
  const [lead, second] = useAccent();
  const shape = useMemo(() => blob(75, 62, 52, 0.2, 9, 3), []);
  return (
    <View style={styles.wrap}>
      <Svg width={150} height={120} viewBox="0 0 150 120">
        <Path d={shape} fill={lead} />
        {FLOWER.flatMap((row, j) =>
          [...row].map((ch, i) =>
            ch === 'X' ? (
              <Rect
                key={`${i}:${j}`}
                x={104 + i * 4}
                y={6 + j * 4}
                width={4}
                height={4}
                fill={second}
              />
            ) : null,
          ),
        )}
        {/* A record, dropped on the blob. */}
        <Circle cx={75} cy={62} r={20} fill="#111014" />
        <Circle cx={75} cy={62} r={6} fill={lead} />
      </Svg>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.line}>{line}</Text>
      {!!action && !!onAction && (
        <TouchableOpacity
          style={styles.btn}
          activeOpacity={0.8}
          onPress={onAction}
          accessibilityRole="button">
          <Text style={styles.btnText}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 36,
    gap: 8,
  },
  title: {color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center'},
  line: {color: C.sub, fontSize: 14, lineHeight: 20, textAlign: 'center'},
  btn: {
    marginTop: 8,
    backgroundColor: C.text,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  btnText: {color: C.bg, fontSize: 14, fontWeight: '800'},
});
