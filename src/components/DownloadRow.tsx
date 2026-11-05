/**
 * A download in flight: dimmed row, live percentage, and a real progress bar.
 *
 * A queued job has no percentage yet, so the bar shows an indeterminate sliver
 * rather than sitting at zero — zero reads as stalled, a sliver reads as
 * starting.
 */
import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import {C, S, T} from '../theme';
import {X} from '../icons';
import {cleanText, getBestArtworkUrl, thumbArtwork} from '../tracks';
import {dismissDownload, retryDownload, type DownloadJob} from '../downloads';

export function DownloadRow({job}: {job: DownloadJob}) {
  const artwork = thumbArtwork(getBestArtworkUrl(job.track));
  const pct = job.progress ?? 0;
  const indeterminate = job.progress === null;
  const failed = job.status === 'error';

  // A failed one is tapped to try again, and has an X to clear it.
  // How far along, as the bar's width: the one style that is per-render.
  const fillWidth: ViewStyle = {
    width: indeterminate ? '8%' : `${Math.round(pct * 100)}%`,
  };
  return (
    <TouchableOpacity
      style={[styles.row, failed && styles.rowFailed]}
      disabled={!failed}
      activeOpacity={0.7}
      onPress={() => retryDownload(job)}
      accessibilityRole={failed ? 'button' : undefined}
      accessibilityLabel={
        failed
          ? `Download failed: ${cleanText(job.track.title)}. Try again`
          : undefined
      }>
      {artwork ? (
        <Image source={{uri: artwork}} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artEmpty]} />
      )}

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {cleanText(job.track.title)}
        </Text>

        <View style={styles.barRow}>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                failed && styles.fillFailed,
                fillWidth,
              ]}
            />
          </View>
          <Text style={[styles.pct, failed && styles.pctFailed]}>
            {failed
              ? 'Failed, tap to retry'
              : indeterminate
              ? 'Queued'
              : `${Math.round(pct * 100)}%`}
          </Text>
        </View>
      </View>
      {failed && (
        <TouchableOpacity
          onPress={() => dismissDownload(job)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear">
          <X size={18} color={C.sub} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: S.gutter,
    paddingVertical: 8,
    opacity: 0.75,
  },
  rowFailed: {opacity: 1},
  pctFailed: {minWidth: 0},
  art: {width: 46, height: 46, borderRadius: 5, backgroundColor: C.surface},
  artEmpty: {backgroundColor: C.surfaceHi},
  text: {flex: 1, minWidth: 0},
  title: {...T.body, color: C.text},
  barRow: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6},
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  fill: {height: '100%', borderRadius: 2, backgroundColor: C.accent},
  fillFailed: {backgroundColor: C.danger},
  pct: {
    ...T.sub,
    color: C.sub,
    fontSize: 11,
    minWidth: 46,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
