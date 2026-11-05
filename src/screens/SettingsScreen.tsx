import React, {useCallback, useEffect, useState} from 'react';
import {
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
  ChevronRight,
  CirclePlay,
  Info,
  Layers,
  Monitor,
  Signal,
} from '../icons';
import {PageBar} from '../components/PageBar';
import {SleepSheet} from '../components/SleepSheet';
import {formatSize} from '../updateNotes';
import {logEvent} from '../analytics';
import {C, S, T} from '../theme';
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
import {formatStorage, StorageBreakdown} from '../components/StorageBreakdown';
import {downloadLikes, forgetDownloads} from '../downloads';
import {DOCS_URL, LICENCE_URL, reportUrl} from '../links';
import {LICENCES} from '../licences';
import {CREDITS, PRIVACY, TERMS} from '../legal';
import {LegalView} from '../components/LegalView';
import {clearSearchHistory} from '../searchHistory';
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
import {useBackPress} from '../useBackPress';
import {
  ActionRow,
  CategoryRow,
  CROSSFADE_MAX,
  NavRow,
  Pill,
  Row,
  Section,
  SizeStepper,
  StepSlider,
  ToggleRow,
  rowStyles,
} from './settings/controls';

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

/** "the 12 songs saved", or "the one song saved". */
function songsSaved(n: number): string {
  return n === 1 ? 'the one song saved' : `the ${n} songs saved`;
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
  useBackPress(back, !!panel);

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
      toast(freed > 0 ? `Cleared ${formatStorage(freed)}` : 'Cache cleared');
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
        <Text style={rowStyles.sectionFooter}>
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
            label="Source on every song"
            hint="The player always shows where a song plays from"
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
            label="Source on every playlist"
            hint="A playlist's own page always says where it came from"
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
          <ToggleRow
            label="Keep Liked Songs offline"
            hint="Download songs you like by themselves, on Wi-Fi"
            value={settings.keepLikedOffline}
            onChange={v => {
              writeSetting('keepLikedOffline', v);
              downloadLikes();
            }}
          />
          <TouchableOpacity
            style={rowStyles.row}
            onPress={pickDownloadFolder}
            activeOpacity={0.7}>
            <View style={rowStyles.rowText}>
              <Text style={rowStyles.rowLabel}>Download location</Text>
              {/* Cut in the middle, so the start and the end of a long path
                  both stay visible. */}
              <Text
                style={rowStyles.rowHint}
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
                ? `Deletes ${songsSaved(storage.downloads_count)} on this phone. Playlists and likes stay.`
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
                ? 'Temporary files and search history. Downloads are kept.'
                : `${formatStorage(
                    cacheBytes,
                  )} of temporary files and search history. Downloads are kept.`
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
          <View style={rowStyles.row}>
            <View style={rowStyles.rowText}>
              <Text style={rowStyles.rowLabel}>Version</Text>
              <Text style={[rowStyles.rowHint, styles.accentHint]}>
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
            style={rowStyles.row}
            activeOpacity={0.7}
            onPress={() => {
              writeSetting('audioQuality', q.value);
              setQualityOpen(false);
            }}>
            <View style={rowStyles.rowText}>
              <Text
                style={[
                  rowStyles.rowLabel,
                  settings.audioQuality === q.value && styles.choiceOn,
                ]}>
                {q.label}
              </Text>
              <Text style={rowStyles.rowHint}>{q.hint}</Text>
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
              <Text style={rowStyles.sectionTitle}>{g.group}</Text>
              {g.items.map(([name, licence]) => (
                <View key={name} style={styles.licenceRow}>
                  <Text style={styles.licenceName}>{name}</Text>
                  <Text style={rowStyles.rowValue}>{licence}</Text>
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
        message={`Deletes ${songsSaved(
          storage?.downloads_count ?? 0,
        )} on this phone. Your playlists and likes are kept, and every song can be downloaded again.`}
        confirmLabel="Remove"
        danger
        onConfirm={doRemoveDownloads}
        onCancel={() => setRemoveOpen(false)}
      />

      <ConfirmModal
        visible={cacheOpen}
        title="Clear cache?"
        message="Frees temporary files and your search history."
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
  /**
   * FLAT. No fill, no radius, no card.
   *
   * A rounded C.surface card on C.bg is a lot of chrome for what is a list, and
   * stacking several of them is where every grey shade on this screen came
   * from. A formal settings screen groups with a label and a hairline and
   * nothing else — which reads as MORE scannable, not less, because the eye
   * stops having to parse three container edges per section.
   */
  sheetTitle: {
    ...T.body,
    color: C.text,
    fontWeight: '700',
    paddingHorizontal: S.gutter,
    paddingTop: 6,
    paddingBottom: 4,
  },
  choiceOn: {color: C.brand},
  resetHint: {...T.listSub, color: C.sub, textAlign: 'center', marginTop: 8},
  tail: {height: 10},
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
});
