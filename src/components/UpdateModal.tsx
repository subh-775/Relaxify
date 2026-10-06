/**
 * The in-app update prompt: a slim strip floating above the mini player.
 * Appears when a newer release is found, fills up as it downloads, and lets
 * the user install or put it off.
 *
 * A strip, not a sheet or a dialog: the page stays visible and usable around
 * it, so a new version is news rather than an interruption.
 *
 * A failure shows here only when a DOWNLOAD failed (see `attempted` in
 * update.ts). A failed automatic check stays quiet; Settings reports it.
 *
 * The same spot carries the one-time usage-statistics notice, after any update
 * card, so the two never stack.
 */
import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Animated, {FadeInDown, FadeOutDown} from 'react-native-reanimated';
import {AlertTriangle, ArrowDownToLine, ChartColumn, X} from '../icons';
import {C, S} from '../theme';
import {dismissUpdate, startUpdateInstall, useUpdate} from '../update';
import {formatSize} from '../updateNotes';
import {BOTTOM_INSET} from '../layout';
import {createStore, useStoreValue} from '../storage';
import {ANALYTICS_NOTE} from '../analytics';

// v2: the notice changed (listening time, likes, playlists and settings joined
// the list in v1.2.23), so everyone sees it once more.
const noticeSeen = createStore<boolean>(
  'mp.analyticsNoticeSeen.v2',
  false,
  raw => raw === true,
);

/** The strip's height, and the room a page's list leaves for it. */
const STRIP_H = 46;
const STRIP_ROOM = STRIP_H + 14;
const INK = '#000000';
const LEMON = '#FFE14D';
const BUTTER = '#FFF3A3';

/** Is the update strip up? The same test UpdateModal renders by. */
function stripUp(u: ReturnType<typeof useUpdate>): boolean {
  return (
    u.phase === 'found' ||
    u.phase === 'downloading' ||
    (u.phase === 'failed' && u.attempted)
  );
}

/**
 * Extra end-of-list room while the strip is up, so the last row of a page can
 * still be scrolled clear of it. Only the END of a list grows, so nothing on
 * screen moves when the strip comes or goes.
 */
export function useUpdateStripRoom(): number {
  return stripUp(useUpdate()) ? STRIP_ROOM : 0;
}

/** A list's end padding: clear of the bottom bars, and of the strip if up. */
export function useListEnd(): {paddingBottom: number} {
  const room = useUpdateStripRoom();
  return useMemo(() => ({paddingBottom: BOTTOM_INSET + room}), [room]);
}

/**
 * The update, as one slim line docked above the mini player: yellow, a thick
 * black edge and a hard shadow, so it reads as news without covering the page.
 * The notes live in Settings; the strip says only what to do.
 */
export function UpdateModal({hidden = false}: {hidden?: boolean}) {
  const u = useUpdate();
  const {phase, info, pct} = u;
  const seen = useStoreValue(noticeSeen);
  if (hidden) {
    return null;
  }
  if (!stripUp(u)) {
    return seen ? null : <Notice />;
  }
  const failed = phase === 'failed';
  const downloading = phase === 'downloading';
  const size = formatSize(info?.sizeBytes);
  const title = failed
    ? 'Update failed'
    : downloading
    ? `Downloading v${info?.version ?? ''}`
    : `v${info?.version} is ready`;

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={styles.strip}
      accessibilityLiveRegion="polite">
      {/* While downloading, the strip itself fills up. */}
      {downloading && (
        <View
          style={[styles.fill, {width: `${Math.max(3, Math.min(100, pct))}%`}]}
        />
      )}
      {failed ? (
        <AlertTriangle size={18} color={INK} strokeWidth={2.4} />
      ) : (
        <ArrowDownToLine size={18} color={INK} strokeWidth={2.4} />
      )}
      <Text style={styles.stripTitle} numberOfLines={1}>
        {title}
        {!downloading && !failed && !!size && (
          <Text style={styles.stripMeta}>{`  ${size}`}</Text>
        )}
      </Text>
      {downloading ? (
        <Text style={styles.stripPct}>{pct}%</Text>
      ) : (
        <>
          <TouchableOpacity
            style={styles.stripBtn}
            onPress={startUpdateInstall}
            accessibilityRole="button">
            <Text style={styles.stripBtnText}>
              {failed ? 'Retry' : 'Install'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={dismissUpdate}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Not now">
            <X size={18} color={INK} strokeWidth={2.6} />
          </TouchableOpacity>
        </>
      )}
    </Animated.View>
  );
}

function Notice() {
  const close = () => noticeSeen.set(true);
  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={styles.card}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <ChartColumn size={18} color={C.accent} strokeWidth={2.2} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Usage statistics</Text>
          <Text style={styles.message}>{ANALYTICS_NOTE}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.install}
              onPress={close}
              accessibilityRole="button">
              <Text style={styles.installText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: S.gutter,
    right: S.gutter + 4, // room for the hard shadow
    bottom: BOTTOM_INSET + 10,
    height: STRIP_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: INK,
    backgroundColor: BUTTER,
    overflow: 'hidden',
    // The neobrutalist hard shadow: an offset slab, no blur. elevation would
    // blur it on Android, so it is drawn as a border instead.
    borderRightWidth: 6,
    borderBottomWidth: 6,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: LEMON,
  },
  stripTitle: {flex: 1, color: INK, fontSize: 14.5, fontWeight: '900'},
  stripMeta: {color: INK, fontSize: 12, fontWeight: '700', opacity: 0.6},
  stripPct: {color: INK, fontSize: 14, fontWeight: '900'},
  stripBtn: {
    backgroundColor: INK,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  stripBtnText: {color: LEMON, fontSize: 13.5, fontWeight: '900'},
  card: {
    position: 'absolute',
    left: S.gutter,
    right: S.gutter,
    bottom: BOTTOM_INSET + 8,
    padding: 16,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 6},
  },
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 12},
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,90,110,0.35)',
    backgroundColor: 'rgba(255,90,110,0.10)',
  },
  text: {flex: 1, minWidth: 0},
  title: {color: C.text, fontSize: 15, fontWeight: '800'},
  message: {color: C.sub, fontSize: 13, lineHeight: 19, marginTop: 4},
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  install: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  installText: {color: C.bg, fontWeight: '800', fontSize: 14},
});
