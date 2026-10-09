/**
 * The in-app update prompt: a slim coral strip floating above the mini player.
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
 * strip, so the two never stack.
 */
import React, {useMemo} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Animated, {FadeInDown, FadeOutDown} from 'react-native-reanimated';
import {ChartColumn, X} from '../icons';
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
const STRIP_H = 52;
/** The hard shadow's offset: a flat blush slab, no blur. */
const SLAB = 4;
const STRIP_ROOM = STRIP_H + SLAB + 10;
const INK = '#000000';
/** The download's fill: the accent, a step deeper. */
const DEEP = '#D9364C';

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
 * The update, as one coral line docked above the mini player: the version and
 * Install. A thick black edge and a flat blush slab for its shadow (a black
 * one vanishes on the app's black), so it reads as news without covering the
 * page. The notes live in Settings; the strip says only what to do.
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
  const v = `v${info?.version ?? ''}`;
  const title = failed
    ? 'Update failed'
    : downloading
    ? `Downloading ${v}`
    : `${v} is out`;
  const meta = downloading
    ? [`${pct}%`, size && `of ${size}`].filter(Boolean).join(' ')
    : failed
    ? [v, size].filter(Boolean).join(' · ')
    : size;

  return (
    <Animated.View
      entering={FadeInDown.duration(260)}
      exiting={FadeOutDown.duration(180)}
      style={styles.dock}
      accessibilityLiveRegion="polite">
      <View style={styles.slab} />
      <View style={styles.strip}>
        {/* While downloading, the strip itself fills up. */}
        {downloading && (
          <View
            style={[
              styles.fill,
              {width: `${Math.max(3, Math.min(100, pct))}%`},
            ]}
          />
        )}
        <View style={styles.body}>
          <Text style={styles.stripTitle} numberOfLines={1}>
            {title}
          </Text>
          {!!meta && (
            <Text style={styles.meta} numberOfLines={1}>
              {meta}
            </Text>
          )}
        </View>
        {!downloading && (
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
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Not now">
              <X size={18} color={INK} strokeWidth={2.8} />
            </TouchableOpacity>
          </>
        )}
      </View>
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
  dock: {
    position: 'absolute',
    left: S.gutter,
    right: S.gutter + SLAB, // room for the slab
    bottom: BOTTOM_INSET + 10 + SLAB,
    height: STRIP_H,
  },
  // The neobrutalist hard shadow: an offset slab, no blur. elevation would
  // blur it on Android.
  slab: {
    ...StyleSheet.absoluteFillObject,
    top: SLAB,
    left: SLAB,
    right: -SLAB,
    bottom: -SLAB,
    borderRadius: 10,
    backgroundColor: C.tone,
  },
  strip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: INK,
    backgroundColor: C.accent,
    overflow: 'hidden',
    paddingLeft: 14,
    paddingRight: 8,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: DEEP,
  },
  body: {flex: 1, minWidth: 0, justifyContent: 'center'},
  stripTitle: {
    color: INK,
    fontSize: 15.5,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  meta: {color: INK, fontSize: 11.5, fontWeight: '700', opacity: 0.7},
  stripBtn: {
    backgroundColor: INK,
    borderRadius: 7,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 8,
  },
  stripBtnText: {color: C.accent, fontSize: 13.5, fontWeight: '900'},
  close: {padding: 6, marginLeft: 4},
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
