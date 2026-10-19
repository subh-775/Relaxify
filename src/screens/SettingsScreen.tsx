import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  BackHandler,
  Linking,
  NativeModules,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  ExternalLink,
  Info,
  Layers,
  Monitor,
  Signal,
} from '../icons';
import {PageBar} from '../components/PageBar';
import {SleepSheet} from '../components/SleepSheet';
import {formatSize} from '../updateNotes';
import {logEvent} from '../analytics';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
// Aliased: this file already has react-native's own Animated, for the refresh
// glyph's rotation loop. Two different `Animated`s in one file is a bug waiting
// to be written.
import ReAnimated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {C, S, T, fs} from '../theme';
import {
  appVersion,
  clearBackendCache,
  getCacheSize,
  deleteDownload,
  getDownloadsInfo,
  getLocalLibrary,
  getStorageInfo,
  setDownloadsDir,
  type DownloadsInfo,
  type StorageInfo,
} from '../backend';
import {
  CACHE_STEPS,
  DATA_SAVER_KBPS,
  resetSettings,
  useStore,
  writeSetting,
} from '../store';
import {createStore, storedBytes, useStoreValue} from '../storage';
import {StorageBreakdown} from '../components/StorageBreakdown';
import {forgetDownloads} from '../downloads';
import {DOCS_URL, LICENCE_URL, reportUrl} from '../links';
import {LICENCES} from '../licences';
import {CREDITS, PRIVACY, TERMS} from '../legal';
import {LegalView} from '../components/LegalView';
import {clearSearchHistory} from '../searchHistory';
import {Toggle} from '../components/Toggle';
import {Sheet} from '../components/Sheet';
import {languagesLabel} from '../languages';
import {LanguagesScreen} from './LanguagesScreen';
import {EqualizerScreen} from './EqualizerScreen';
import {ConfirmModal} from '../components/ConfirmModal';
import {applyAudioEffects} from '../audioEffects';
import {dropQueuedRadio} from '../player';
import {EQ_PRESETS} from '../eq';
import {toast} from '../toast';
import {enforceCacheLimit} from '../cacheLimit';
import {startUpdateInstall, useUpdate} from '../update';
import {sleepLabel, useSleepTimer} from '../sleepTimer';
import {BOTTOM_INSET} from '../layout';

function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  const mb = n / (1024 * 1024);
  return mb < 1 ? `${Math.round(n / 1024)} KB` : `${mb.toFixed(1)} MB`;
}

/**
 * What the last visit to this screen learned from the backend.
 *
 * Settings is an overlay that UNMOUNTS when closed, so every reopen started
 * from scratch: the download folder was blank and the cache size and storage
 * bar were missing — every single time, for as long as the backend round trips
 * took. None of it
 * changes between two opens a minute apart, so it is remembered here and used
 * as the initial state; the fetch still runs and overwrites it, but the screen
 * is already complete while that happens.
 *
 * PERSISTED, not module scope. It used to die with the process, on the
 * reasoning that a cache of remote answers should — which is true of the
 * answers and false of the experience: the open that dies with the process is
 * the FIRST open of every launch, which is exactly the one where you sit and
 * watch a blank folder path and no cache size fill themselves
 * in. Every launch showed the loading state once, so "it loads every time" was
 * an accurate description of it.
 *
 * A stale answer here is harmless — the live fetch overwrites it a moment later
 * — and being one launch out of date beats being blank.
 */
type RemoteCache = {
  downloads: DownloadsInfo | null;
  cacheBytes: number | null;
  storage: StorageInfo | null;
};

const EMPTY_REMOTE: RemoteCache = {
  downloads: null,
  cacheBytes: null,
  storage: null,
};

const remoteCache = createStore<RemoteCache>(
  'mp.settingsRemote.v1',
  EMPTY_REMOTE,
  (raw: unknown) => {
    const r = (raw ?? {}) as Partial<RemoteCache>;
    return {
      downloads: r.downloads ?? null,
      cacheBytes: typeof r.cacheBytes === 'number' ? r.cacheBytes : null,
      storage:
        r.storage && typeof r.storage === 'object'
          ? (r.storage as StorageInfo)
          : null,
    };
  },
);

function patchRemote(p: Partial<RemoteCache>): void {
  remoteCache.set({...remoteCache.get(), ...p});
}

/**
 * Fetch the backend-backed answers Settings shows.
 *
 * Each lands INDEPENDENTLY. They used to be awaited together through
 * Promise.allSettled, which means nothing appeared until the slowest returned —
 * and they are not remotely comparable: a source-reachability probe is a round
 * trip to every catalogue, while getCacheSize() is a local directory walk. The
 * fast answers were waiting on the slow one for no reason.
 *
 * Exported so the drawer can start them the moment it opens: by the time the
 * "Settings" row is tapped the answers are usually already back, and the screen
 * opens finished rather than filling in.
 */
export function prefetchSettingsRemote(): void {
  // The source-reachability probe is deliberately gone. It cost a network
  // round trip to every catalogue — the slowest answer here by a wide margin —
  // purely to decide which rows to render, and those rows are known at build
  // time. Its client was deleted with it; nothing else read it.
  getDownloadsInfo()
    .then(v => patchRemote({downloads: v}))
    .catch(() => {});
  getCacheSize()
    .then(v => patchRemote({cacheBytes: v.bytes}))
    .catch(() => {});
  refreshStorage();
}

/** Re-measure the storage bar: after a clear, a removal, or on opening. */
function refreshStorage(): void {
  getStorageInfo()
    .then(v => patchRemote({storage: v}))
    .catch(() => {});
}

const QUALITIES = [
  {value: 0, label: 'Auto', hint: 'Adjusts to the source'},
  {value: 96, label: 'Low', hint: '96 kbps — saves data'},
  {value: 128, label: 'Normal', hint: '128 kbps — balanced'},
  {value: 256, label: 'High', hint: '256 kbps'},
  {value: 320, label: 'Very High', hint: '320 kbps — best quality'},
];

/**
 * A settings group: a white heading over its rows, Spotify's way.
 *
 * No card, no hairlines. Ruled rows made the screen one long ribbon of lines;
 * a bold heading and the space around each group give it its start and end
 * instead, and the rows read as plain text.
 */
function Section({
  title,
  Icon,
  footer,
  children,
}: {
  title: string;
  Icon?: RowIcon;
  /** One line under the card, for the explanation that would otherwise be
   *  crammed into a row's `hint`. */
  footer?: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        {!!Icon && <Icon size={13} color={C.faint} strokeWidth={2.6} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.card}>
        {items.map((child, i) => (
          // child.key, not the index. These children are conditional (the
          // update row's states, the sources list), and an index key makes
          // React reuse the wrong instance when one appears or disappears —
          // component state leaks across rows. React.Children.toArray already
          // assigns stable keys; use them.
          <React.Fragment key={(child as {key?: string}).key ?? i}>
            {child}
          </React.Fragment>
        ))}
      </View>
      {!!footer && <Text style={styles.sectionFooter}>{footer}</Text>}
    </View>
  );
}

type RowIcon = React.ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

/** A row's leading icon, the same size and colour everywhere. */
function Lead({Icon}: {Icon?: RowIcon}) {
  return Icon ? <Icon size={19} color={C.sub} strokeWidth={2} /> : null;
}

function Row({
  label,
  value,
  hint,
  onPress,
  Icon,
  external,
}: {
  label: string;
  value?: string;
  hint?: string;
  onPress?: () => void;
  Icon?: RowIcon;
  /** Leaves the app (a web page, the file manager): marked as such. */
  external?: boolean;
}) {
  const Wrap: React.ElementType = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Lead Icon={Icon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      {/* A row that DOES something has to look different from one that just
          reports a number. Without this, "Streaming quality — Very High" was
          indistinguishable from a read-only line, so nobody knew it opened. */}
      {!!onPress &&
        (external ? (
          <ExternalLink size={17} color={C.faint} />
        ) : (
          <ChevronRight size={17} color={C.faint} />
        ))}
    </Wrap>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
  Icon,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  Icon?: RowIcon;
}) {
  return (
    <View style={styles.row}>
      <Lead Icon={Icon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </View>
  );
}

const CROSSFADE_MAX = 12;

/** Position along the track (0..1) for a touch at `x` on a track `w` wide. */
function fracAt(x: number, w: number): number {
  'worklet';
  return Math.max(0, Math.min(1, x / (w || 1)));
}

/** The nearest step for a track position: the value only ever lands on one. */
function stepAt(f: number, max: number, step: number): number {
  'worklet';
  return Math.round((f * max) / step) * step;
}

/**
 * A horizontal bar you drag from Off up to `max` in whole steps: crossfade
 * (0–12s) and the cache limit (Off, 10–100 MB). 0 always reads as Off.
 *
 * It was a ‹‹ 9s ›› stepper because an earlier draggable bar was fiddly to land
 * on an exact second. That bar was fiddly for a reason this one does not share:
 * it ran on the JS thread, so the fill trailed the finger, and it reported a
 * continuous value the label then rounded — you could not see which second you
 * were on until you let go. Here the fill is a shared value written straight
 * from the worklet, the readout is derived from the position and crosses to JS
 * only when the WHOLE second changes, and the release snaps the fill to the
 * second it committed. Same machinery as the equalizer bands.
 *
 * The gesture is horizontal-only on purpose. Android's vertical ScrollView
 * intercepts on vertical travel past the touch slop and ignores horizontal
 * travel entirely, so activeOffsetX + failOffsetY is enough here — unlike the
 * equalizer, where the band drags along the SAME axis as its scroller and needs
 * blocksExternalGesture to stop the touch being taken.
 */
function StepSlider({
  label,
  hint,
  value,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  max: number;
  step: number;
  /** The readout for a value above 0; 0 always reads as Off. */
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const secsAt = useCallback(
    (f: number) => {
      'worklet';
      return stepAt(f, max, step);
    },
    [max, step],
  );
  const t = useSharedValue(value / max);
  /** The track's real measured width, so the worklet never has to ask JS. */
  const w = useSharedValue(1);
  /** 0 at rest, 1 while held — the thumb grows under the finger. */
  const grow = useSharedValue(0);
  const [shown, setShown] = useState(Math.round(value));
  const dragging = useRef(false);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  // Follow the setting when it changes from OUTSIDE a drag (a reset, mostly).
  useEffect(() => {
    if (!dragging.current) {
      t.value = value / max;
    }
  }, [value, t, max]);

  // The readout, derived from the position rather than pushed by the gesture,
  // so it is right whoever moved the bar — and it reaches JS about twelve times
  // across a full drag instead of sixty times a second.
  useAnimatedReaction(
    () => secsAt(t.value),
    (secs, prev) => {
      if (secs !== prev) {
        runOnJS(setShown)(secs);
      }
    },
  );

  const setDragging = useCallback((on: boolean) => {
    dragging.current = on;
  }, []);
  const commit = useCallback((secs: number) => changeRef.current(secs), []);

  const gesture = useMemo(() => {
    const scrub = Gesture.Pan()
      .activeOffsetX([-4, 4])
      .failOffsetY([-14, 14])
      .onBegin(() => {
        runOnJS(setDragging)(true);
      })
      .onStart(e => {
        grow.value = withTiming(1, {duration: 120});
        t.value = fracAt(e.x, w.value);
      })
      .onUpdate(e => {
        t.value = fracAt(e.x, w.value);
      })
      .onEnd(() => {
        // Snap the FILL to the second being committed, so what is on screen and
        // what was stored are the same thing.
        const secs = secsAt(t.value);
        t.value = withTiming(secs / max, {duration: 90});
        runOnJS(commit)(secs);
      })
      .onFinalize(() => {
        grow.value = withTiming(0, {duration: 180});
        runOnJS(setDragging)(false);
      });

    // Tap to jump. A Pan cannot serve this without activating on touch-down,
    // and activating on touch-down would take every touch that was meant for
    // the page scroll.
    const jump = Gesture.Tap()
      .maxDuration(400)
      .onEnd((e, success) => {
        if (!success) {
          return;
        }
        const secs = secsAt(fracAt(e.x, w.value));
        t.value = withTiming(secs / max, {duration: 120});
        runOnJS(commit)(secs);
      });

    return Gesture.Race(scrub, jump);
  }, [grow, t, w, setDragging, commit, secsAt, max]);

  const fillStyle = useAnimatedStyle(() => ({width: `${t.value * 100}%`}));
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${t.value * 100}%`,
    transform: [{scale: 1 + grow.value * 0.3}],
  }));

  return (
    <View style={styles.slider}>
      <View style={styles.sliderHead}>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowHint}>{hint}</Text>
        </View>
        <Text style={[styles.sliderValue, shown === 0 && styles.sliderOff]}>
          {shown > 0 ? format(shown) : 'Off'}
        </Text>
      </View>

      {/* ~28px visual, 44px touch (Fitts') — a 4px bar is unhittable. */}
      <GestureDetector gesture={gesture}>
        <View
          style={styles.sliderTouch}
          onLayout={e => {
            w.value = e.nativeEvent.layout.width;
          }}>
          <View style={styles.sliderTrack}>
            <ReAnimated.View style={[styles.sliderFill, fillStyle]} />
          </View>
          <ReAnimated.View
            style={[styles.sliderThumb, thumbStyle]}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>

      <View style={styles.sliderEnds}>
        <Text style={styles.sliderEnd}>Off</Text>
        <Text style={styles.sliderEnd}>{format(max)}</Text>
      </View>
    </View>
  );
}

/**
 * A size picked from a short list, with arrows either side of it, on the
 * row's own line: for the cache limit, where only a few sizes make sense and
 * a slider made you hunt for them.
 */
function SizeStepper({
  label,
  hint,
  value,
  steps,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  /** In MB, ascending; 0 reads as Off. */
  steps: number[];
  onChange: (v: number) => void;
}) {
  const at = Math.max(0, steps.indexOf(value));
  const go = (i: number) => onChange(steps[i]);
  const arrow = (i: number, Icon: typeof ChevronLeft, name: string) => (
    <TouchableOpacity
      onPress={() => go(i)}
      disabled={i < 0 || i >= steps.length}
      hitSlop={8}
      style={[styles.stepBtn, (i < 0 || i >= steps.length) && styles.stepOff]}
      accessibilityRole="button"
      accessibilityLabel={name}>
      <Icon size={20} color={C.text} />
    </TouchableOpacity>
  );
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      {arrow(at - 1, ChevronLeft, 'Smaller')}
      <Text style={[styles.sizeValue, !value && styles.sliderOff]}>
        {value ? `${value} MB` : 'Off'}
      </Text>
      {arrow(at + 1, ChevronRight, 'Bigger')}
    </View>
  );
}

function NavRow({
  label,
  value,
  onPress,
  Icon,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  Icon?: RowIcon;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Lead Icon={Icon} />
      <Text style={[styles.rowLabel, styles.rowText]}>{label}</Text>
      {!!value && (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      )}
      <ChevronRight size={18} color={C.faint} />
    </TouchableOpacity>
  );
}

type Panel =
  | 'playback'
  | 'data'
  | 'display'
  | 'storage'
  | 'about'
  | 'equalizer'
  | 'languages'
  | 'terms'
  | 'privacy';

/** Where Back goes from a page opened inside another one; every other page
 *  returns to the main list. */
const PARENT: Partial<Record<Panel, Panel>> = {
  equalizer: 'playback',
  languages: 'display',
  terms: 'about',
  privacy: 'about',
};

const TITLES: Partial<Record<Panel, string>> = {
  playback: 'Playback',
  data: 'Data saver and quality',
  display: 'Display preferences',
  storage: 'Storage',
  about: 'About and support',
};

/** One of the main list's categories: its icon, its name, what is inside. */
function CategoryRow({
  Icon,
  label,
  hint,
  onPress,
}: {
  Icon: typeof Info;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.category}
      onPress={onPress}
      activeOpacity={0.7}>
      <Icon size={23} color={C.text} strokeWidth={1.8} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <ChevronRight size={18} color={C.faint} />
    </TouchableOpacity>
  );
}

/** A rounded button, outlined white as Spotify's settings have them; filled
 *  in the accent for the one thing to do now (Install). */
function Pill({
  label,
  onPress,
  disabled,
  filled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.pill,
        filled && styles.pillFilled,
        disabled && styles.pillOff,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button">
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A thing to do, said beside its button (Remove all downloads, Clear
 *  cache), one line as Spotify has it: no red, the confirmation asks first. */
function ActionRow({
  label,
  hint,
  action,
  onPress,
  disabled,
}: {
  label: string;
  hint: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Pill label={action} onPress={onPress} disabled={disabled} />
    </View>
  );
}

export function SettingsScreen({
  onClose,
  focus,
}: {
  onClose: () => void;
  /** Open the screen AT something. 'update' opens About and support, where
   *  a waiting update sits on the Version row: what the dot on the menu
   *  button points at. */
  focus?: 'update' | null;
}) {
  const [panel, setPanel] = useState<Panel | null>(
    focus === 'update' ? 'about' : null,
  );
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [licencesOpen, setLicencesOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [cacheOpen, setCacheOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const {settings} = useStore();
  // One subscription, three values: the store IS the state, so a prefetch
  // that lands while the screen is open simply shows up.
  const {downloads, cacheBytes, storage} = useStoreValue(remoteCache);
  const sleep = useSleepTimer();
  const update = useUpdate();

  const back = useCallback(
    () => setPanel(p => (p ? PARENT[p] ?? null : null)),
    [],
  );

  // A page inside Settings catches the hardware back itself and steps out one
  // page, NOT the app-level handler, which would close Settings entirely.
  // Registered after the app's handler, so it runs first; on the main list it
  // declines and the app's handler closes Settings as before.
  useEffect(() => {
    const onBack = () => {
      if (panel) {
        back();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [panel, back]);

  useEffect(() => {
    if (focus === 'update') {
      setPanel('about');
    }
  }, [focus]);

  // Refresh on open. The screen is already populated from the cache, so this
  // updates in place rather than filling in from nothing.
  useEffect(() => {
    prefetchSettingsRemote();
  }, []);

  const qualityLabel =
    QUALITIES.find(q => q.value === settings.audioQuality)?.label ??
    'Very High';
  const folder = downloads?.path || downloads?.download_dir || '';

  /** System folder picker -> backend. The backend refuses an unwritable folder,
   *  so a bad pick fails loudly here instead of silently failing downloads. */
  const pickDownloadFolder = useCallback(async () => {
    const native = NativeModules.Backend as {
      pickFolder?: () => Promise<string>;
    };
    if (typeof native.pickFolder !== 'function') {
      toast('Folder picking needs the newest APK.');
      return;
    }
    try {
      const path = await native.pickFolder();
      if (!path) {
        return; // backed out of the picker
      }
      const res = await setDownloadsDir(path);
      if (res.ok === false) {
        toast(res.error || 'Could not use that folder');
        return;
      }
      patchRemote({
        downloads: {...(remoteCache.get().downloads ?? {}), ...res},
      });
      toast('Download folder updated');
    } catch {
      toast('Could not change the folder');
    }
  }, []);

  const openDownloadFolder = useCallback(async () => {
    const native = NativeModules.Backend as {
      openFolder?: (p: string) => Promise<boolean>;
    };
    const path = folder || downloads?.download_dir || downloads?.path || '';
    if (typeof native.openFolder !== 'function') {
      toast('Opening the folder needs the newest APK.');
      return;
    }
    if (!path) {
      toast('No download folder yet');
      return;
    }
    try {
      if (!(await native.openFolder(path))) {
        toast('No file manager on this device');
      }
    } catch {
      toast('Could not open the folder');
    }
  }, [folder, downloads]);

  const doReset = useCallback(() => {
    resetSettings();
    setResetOpen(false);
    toast('Settings reset to defaults');
  }, []);

  /**
   * Clear cache — a real one, not a placebo button.
   *
   * Backend side drops resolved stream URLs, lyrics, home rows and the files in
   * the app's cache directory; app side drops search history. Downloads,
   * playlists and likes are deliberately untouched: the whole point of the
   * button is that it's safe to press.
   */
  const doClearCache = useCallback(async () => {
    setCacheOpen(false);
    setClearing(true);
    try {
      const freed = await clearBackendCache();
      logEvent('cache_cleared', {
        auto: 0,
        freed_mb: Math.round(freed / 1048576),
      });
      clearSearchHistory();
      patchRemote({cacheBytes: 0});
      toast(freed > 0 ? `Cleared ${formatBytes(freed)}` : 'Cache cleared');
      // Re-read rather than assume zero — Android may hold files open.
      refreshStorage();
      getCacheSize()
        .then(r => patchRemote({cacheBytes: r.bytes}))
        .catch(() => {});
    } catch {
      toast("Couldn't clear the cache");
    } finally {
      setClearing(false);
    }
  }, []);

  /** Delete every downloaded song, one by one through the same guarded
   *  endpoint a single delete uses, then tell the library what is gone. */
  const doRemoveDownloads = useCallback(async () => {
    setRemoveOpen(false);
    setRemoving(true);
    try {
      const {tracks} = await getLocalLibrary();
      const gone = [];
      for (const t of tracks) {
        if (
          t.file_path &&
          (await deleteDownload(t.file_path).catch(() => false))
        ) {
          gone.push(t);
        }
      }
      forgetDownloads(gone);
      toast(
        gone.length
          ? `Removed ${gone.length} download${gone.length === 1 ? '' : 's'}`
          : 'There were no downloads to remove',
      );
    } catch {
      toast('Could not remove the downloads');
    } finally {
      setRemoving(false);
      refreshStorage();
    }
  }, []);

  // Anything with more than a switch's worth of choice gets its OWN page.
  if (panel === 'equalizer') {
    return <EqualizerScreen onClose={back} />;
  }
  if (panel === 'languages') {
    return <LanguagesScreen onClose={back} />;
  }
  if (panel === 'terms' || panel === 'privacy') {
    return (
      <LegalView doc={panel === 'terms' ? TERMS : PRIVACY} onBack={back} />
    );
  }

  const updateAvailable = update.info?.available === true;
  // Android's own fields; React Native's shared type does not list them.
  const phone = Platform.constants as {
    Brand?: string;
    Model?: string;
    Release?: string;
  };

  let body: React.ReactNode;
  if (panel === 'playback') {
    body = (
      <>
        <ToggleRow
          label="Autoplay"
          hint="Keep playing similar songs when the queue ends"
          value={settings.autoplay}
          onChange={v => {
            writeSetting('autoplay', v);
            // Switching it OFF has to clear the picks radio already
            // queued, or the setting reads as ignored: the top-up runs a
            // few songs ahead, so there are normally eight of them sitting
            // there and playback carried straight on into them.
            if (!v) {
              dropQueuedRadio().catch(() => {});
            }
          }}
        />
        <ToggleRow
          label="Normalize volume"
          hint="Play every track at the same loudness"
          value={settings.normalizeVolume}
          onChange={v => {
            writeSetting('normalizeVolume', v);
            applyAudioEffects();
          }}
        />
        <ToggleRow
          label="Headphone memory"
          hint="Each pair of headphones, speaker or car keeps its own equalizer"
          value={settings.deviceMemory}
          onChange={v => writeSetting('deviceMemory', v)}
        />
        <ToggleRow
          label="Resume when headphones connect"
          hint="Carry on playing when you put your headphones on"
          value={settings.resumeOnConnect}
          onChange={v => writeSetting('resumeOnConnect', v)}
        />
        <StepSlider
          label="Crossfade"
          hint="Overlap the end of one song into the next. Skipped when the next song can't buffer in time."
          value={settings.crossfadeDuration}
          max={CROSSFADE_MAX}
          step={1}
          format={secs => `${secs}s`}
          onChange={secs => writeSetting('crossfadeDuration', secs)}
        />
        <NavRow
          label="Equalizer"
          value={
            settings.eqEnabled
              ? EQ_PRESETS.find(p => p.id === settings.eqPreset)?.label ||
                'Custom'
              : 'Off'
          }
          onPress={() => setPanel('equalizer')}
        />
        <NavRow
          label="Sleep timer"
          value={sleepLabel(sleep) || 'Off'}
          onPress={() => setSleepOpen(true)}
        />
      </>
    );
  } else if (panel === 'data') {
    body = (
      <>
        <ToggleRow
          label="Data saver on mobile data"
          hint={`Streams at ${DATA_SAVER_KBPS} kbps off Wi-Fi`}
          value={settings.dataSaver}
          onChange={v => writeSetting('dataSaver', v)}
        />
        <Row
          label="Streaming quality"
          value={qualityLabel}
          onPress={() => setQualityOpen(true)}
        />
        <Text style={styles.sectionFooter}>
          Downloads always use the best quality a source offers, regardless of
          this setting.
        </Text>
      </>
    );
  } else if (panel === 'display') {
    body = (
      <>
        <Section title="Home">
          <NavRow
            label="Languages for music"
            value={languagesLabel(settings.homeLanguages)}
            onPress={() => setPanel('languages')}
          />
          <ToggleRow
            label="Home style as Speed Dial"
            value={settings.homeGrid}
            onChange={v => writeSetting('homeGrid', v)}
          />
        </Section>
        <Section title="Labels">
          <ToggleRow
            label="Show source label"
            hint="Marks which service each track came from"
            value={settings.showSourceBadge}
            onChange={v => writeSetting('showSourceBadge', v)}
          />
          <ToggleRow
            label="Show quality label"
            hint="Marks each track with its bitrate"
            value={settings.showQualityBadge}
            onChange={v => writeSetting('showQualityBadge', v)}
          />
          <ToggleRow
            label="Show playlist source"
            hint="Marks playlists from Spotify, YouTube or a friend's link"
            value={settings.showPlaylistSource}
            onChange={v => writeSetting('showPlaylistSource', v)}
          />
        </Section>
      </>
    );
  } else if (panel === 'storage') {
    body = (
      <>
        {storage && storage.total_bytes > 0 && (
          <StorageBreakdown info={storage} savedBytes={storedBytes()} />
        )}
        <Section title="Downloads">
          <TouchableOpacity
            style={styles.row}
            onPress={pickDownloadFolder}
            activeOpacity={0.7}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Download location</Text>
              {/* Cut in the middle, so the start and the end of a long path
                  both stay visible. */}
              <Text
                style={styles.rowHint}
                numberOfLines={1}
                ellipsizeMode="middle">
                {folder ||
                  (downloads?.using_fallback ? 'App storage' : 'Not set yet')}
              </Text>
            </View>
            <ChevronRight size={17} color={C.faint} />
          </TouchableOpacity>
          <Row label="Open in Files" onPress={openDownloadFolder} external />
          <ActionRow
            label="Remove all downloads"
            hint={
              storage?.downloads_count
                ? `Deletes the ${storage.downloads_count} songs saved on this phone. Playlists and likes stay.`
                : 'No downloaded songs on this phone.'
            }
            action={removing ? 'Removing…' : 'Remove'}
            onPress={() => setRemoveOpen(true)}
            disabled={removing || !storage?.downloads_count}
          />
        </Section>
        <Section title="Cache">
          <ActionRow
            label="Clear cache"
            hint={
              cacheBytes == null
                ? 'Temporary files, lyrics and search history. Downloads are kept.'
                : `${formatBytes(
                    cacheBytes,
                  )} of temporary files, lyrics and search history. Downloads are kept.`
            }
            action={clearing ? 'Clearing…' : 'Clear'}
            onPress={() => setCacheOpen(true)}
            disabled={clearing}
          />
          <SizeStepper
            label="Cache limit"
            hint="Cleared on the next launch once it grows past this"
            value={settings.cacheLimitMb}
            steps={CACHE_STEPS}
            onChange={mb => {
              writeSetting('cacheLimitMb', mb);
              enforceCacheLimit(true).then(() =>
                getCacheSize()
                  .then(r => patchRemote({cacheBytes: r.bytes}))
                  .catch(() => {}),
              );
            }}
          />
        </Section>
      </>
    );
  } else if (panel === 'about') {
    const size = formatSize(update.info?.sizeBytes);
    body = (
      <>
        {/* A waiting update lives on the Version row: the coral strip shows
            it by itself, and this is where it stays after the strip is put
            away. Checks run on their own, at launch and on every return to
            the app; there is nothing to press to look. */}
        {updateAvailable || update.phase === 'downloading' ? (
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Version</Text>
              <Text style={[styles.rowHint, styles.accentHint]}>
                {update.phase === 'downloading'
                  ? `Downloading ${update.info?.version}… ${update.pct}%`
                  : update.phase === 'failed'
                  ? "Couldn't download it. Try again."
                  : `${update.info?.version} is ready${
                      size ? `, ${size}` : ''
                    }`}
              </Text>
            </View>
            {update.phase !== 'downloading' && (
              <Pill label="Install" filled onPress={startUpdateInstall} />
            )}
          </View>
        ) : (
          <Row label="Version" value={appVersion || '—'} />
        )}
        <View style={styles.divider} />
        <Row label="Privacy Policy" onPress={() => setPanel('privacy')} />
        <Row label="Terms of Use" onPress={() => setPanel('terms')} />
        <Row
          label="Third-party licences"
          onPress={() => setLicencesOpen(true)}
        />
        <Row
          label="Licence"
          hint="GNU GPL v3, free and open source"
          onPress={() => Linking.openURL(LICENCE_URL).catch(() => {})}
          external
        />
        <View style={styles.divider} />
        <Row
          label="How to use"
          onPress={() =>
            Linking.openURL(DOCS_URL).catch(() =>
              toast('Could not open the guide'),
            )
          }
          external
        />
        <Row
          label="Report a problem"
          external
          onPress={() =>
            Linking.openURL(
              reportUrl(
                appVersion,
                `${phone.Brand ?? ''} ${phone.Model ?? ''}`.trim(),
                String(phone.Release ?? Platform.Version),
              ),
            ).catch(() => toast('Could not open GitHub'))
          }
        />
        <Text style={styles.credit}>{CREDITS}</Text>
      </>
    );
  } else {
    body = (
      <>
        <CategoryRow
          Icon={CirclePlay}
          label="Playback"
          hint="Autoplay, crossfade, equalizer, sleep"
          onPress={() => setPanel('playback')}
        />
        <CategoryRow
          Icon={Signal}
          label="Data saver and quality"
          hint="Data saver, streaming quality"
          onPress={() => setPanel('data')}
        />
        <CategoryRow
          Icon={Monitor}
          label="Display preferences"
          hint="Labels, Home style, languages"
          onPress={() => setPanel('display')}
        />
        <CategoryRow
          Icon={Layers}
          label="Storage"
          hint="Downloads, cache"
          onPress={() => setPanel('storage')}
        />
        <CategoryRow
          Icon={Info}
          label="About and support"
          hint="Version, privacy policy"
          onPress={() => setPanel('about')}
        />
        <View style={styles.resetWrap}>
          <Pill label="Reset" onPress={() => setResetOpen(true)} />
          <Text style={styles.resetHint}>
            Puts everything back to defaults. Your library isn&apos;t touched.
          </Text>
        </View>
      </>
    );
  }

  return (
    <View style={styles.wrap}>
      <PageBar
        title={(panel && TITLES[panel]) || 'Settings'}
        onBack={panel ? back : onClose}
      />
      {/* Keyed per page: without it React reuses one ScrollView, scroll
          offset and all, and a page could open half-way down. */}
      <ScrollView
        key={panel ?? 'main'}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}>
        {body}
        <View style={styles.tail} />
      </ScrollView>

      {/* A sheet, not an inline expander: five rows appearing in the middle
          of the list shoved everything below them down with no motion. */}
      <Sheet open={qualityOpen} onClose={() => setQualityOpen(false)}>
        <Text style={styles.sheetTitle}>Streaming quality</Text>
        {QUALITIES.map(q => (
          <TouchableOpacity
            key={q.value}
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => {
              writeSetting('audioQuality', q.value);
              setQualityOpen(false);
            }}>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.rowLabel,
                  settings.audioQuality === q.value && styles.choiceOn,
                ]}>
                {q.label}
              </Text>
              <Text style={styles.rowHint}>{q.hint}</Text>
            </View>
            {settings.audioQuality === q.value && (
              <Check size={18} color={C.brand} strokeWidth={2.6} />
            )}
          </TouchableOpacity>
        ))}
      </Sheet>
      <Sheet open={licencesOpen} onClose={() => setLicencesOpen(false)}>
        <Text style={styles.sheetTitle}>Open-source licences</Text>
        <ScrollView style={styles.licences}>
          {LICENCES.map(g => (
            <View key={g.group} style={styles.licenceGroup}>
              <Text style={styles.sectionTitle}>{g.group}</Text>
              {g.items.map(([name, licence]) => (
                <View key={name} style={styles.licenceRow}>
                  <Text style={styles.licenceName}>{name}</Text>
                  <Text style={styles.rowValue}>{licence}</Text>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </Sheet>

      <SleepSheet open={sleepOpen} onClose={() => setSleepOpen(false)} />

      <ConfirmModal
        visible={resetOpen}
        title="Reset all settings?"
        message="Everything goes back to defaults. Your library isn't touched."
        confirmLabel="Reset"
        danger
        onConfirm={doReset}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmModal
        visible={removeOpen}
        title="Remove all downloads?"
        message={`Deletes the ${
          storage?.downloads_count ?? 0
        } songs saved on this phone. Your playlists and likes are kept, and every song can be downloaded again.`}
        confirmLabel="Remove"
        danger
        onConfirm={doRemoveDownloads}
        onCancel={() => setRemoveOpen(false)}
      />

      <ConfirmModal
        visible={cacheOpen}
        title="Clear cache?"
        message="Frees temporary files, saved lyrics and your search history."
        confirmLabel="Clear"
        onConfirm={doClearCache}
        onCancel={() => setCacheOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  // Enough tail room that the last row clears the mini player + bottom nav —
  // the reset button was getting clipped by a small amount.
  // The bars at the foot of the app float OVER the page now, so a list has to
  // end above them or its last row is permanently behind one. See src/layout.ts.
  // flexGrow: the page is at least the screen's height, so the main page's
  // Reset (marginTop 'auto') sits at its foot rather than under the list.
  scroll: {flexGrow: 1, paddingBottom: BOTTOM_INSET},
  section: {paddingTop: 22},
  licences: {maxHeight: 420},
  credit: {
    color: C.faint,
    fontSize: 12.5,
    lineHeight: 19,
    paddingHorizontal: S.gutter + 4,
    marginTop: -4,
  },
  licenceGroup: {paddingHorizontal: S.gutter, paddingTop: 14, gap: 8},
  licenceRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  licenceName: {flex: 1, color: C.text, fontSize: 14},
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: S.gutter,
    marginBottom: 2,
  },
  // A plain white heading, as Spotify's settings have: the group is named
  // in the same voice as the screen, not in small grey capitals.
  sectionTitle: {
    fontSize: fs(18),
    lineHeight: fs(24),
    fontWeight: '700',
    letterSpacing: -0.2,
    color: C.text,
  },
  /**
   * FLAT. No fill, no radius, no card.
   *
   * A rounded C.surface card on C.bg is a lot of chrome for what is a list, and
   * stacking several of them is where every grey shade on this screen came
   * from. A formal settings screen groups with a label and a hairline and
   * nothing else — which reads as MORE scannable, not less, because the eye
   * stops having to parse three container edges per section.
   */
  // No lines at all now: the heading and the space around a group are
  // what separate it.
  card: {},
  sectionFooter: {
    ...T.sub,
    color: C.faint,
    paddingHorizontal: S.gutter,
    paddingTop: 7,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // Aligned to the page gutter now that there is no card inset to sit inside.
    paddingHorizontal: S.gutter,
    paddingVertical: 12,
    gap: 14,
  },
  sheetTitle: {
    ...T.body,
    color: C.text,
    fontWeight: '700',
    paddingHorizontal: S.gutter,
    paddingTop: 6,
    paddingBottom: 4,
  },
  choiceOn: {color: C.brand},
  rowText: {flex: 1, minWidth: 0},
  // 15 px, Spotify's settings size: the list's 16 read heavy here.
  rowLabel: {...T.listTitle, color: C.text, fontSize: 15, lineHeight: 20},
  rowHint: {...T.listSub, color: C.sub, marginTop: 2},
  rowValue: {
    fontSize: fs(14),
    fontWeight: '400',
    color: C.sub,
    flexShrink: 1,
    maxWidth: 190,
    textAlign: 'right',
  },
  resetHint: {...T.listSub, color: C.sub, textAlign: 'center', marginTop: 8},
  tail: {height: 10},
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    minHeight: 64,
    paddingHorizontal: S.gutter,
    paddingVertical: 10,
  },
  pill: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  pillFilled: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  pillOff: {opacity: 0.4},
  pillText: {color: C.text, fontSize: 14, fontWeight: '700'},
  accentHint: {color: C.accent},
  divider: {height: 1, backgroundColor: C.border, marginVertical: 6},
  // Pinned to the foot of the page, just above the mini player; on a screen
  // too short for that it keeps 56 of air under the last category.
  resetWrap: {
    alignItems: 'center',
    marginTop: 'auto',
    paddingTop: 56,
    paddingHorizontal: S.gutter,
  },
  slider: {paddingHorizontal: S.gutter, paddingTop: 14, paddingBottom: 6},
  sliderHead: {flexDirection: 'row', alignItems: 'flex-start', gap: 14},
  sliderValue: {
    ...T.rowTitle,
    color: C.brand,
    fontSize: 16,
    // Tabular, or the whole row twitches sideways every time the number goes
    // from one digit to two while you are dragging.
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },
  sliderOff: {color: C.faint},
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceHi,
  },
  stepOff: {opacity: 0.3},
  sizeValue: {
    minWidth: 58,
    textAlign: 'center',
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sliderTouch: {justifyContent: 'center', height: 44, marginTop: 4},
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.13)',
    overflow: 'hidden',
  },
  sliderFill: {height: '100%', backgroundColor: C.brand, borderRadius: 2},
  sliderThumb: {
    position: 'absolute',
    // Half the thumb's width, so it sits centred on the value.
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.brand,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 3,
    shadowOffset: {width: 0, height: 1},
    elevation: 3,
  },
  sliderEnds: {flexDirection: 'row', justifyContent: 'space-between'},
  sliderEnd: {...T.sub, color: C.faint, fontSize: 11},
});
