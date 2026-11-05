/**
 * Jam: start one, join one with a code, and then the room itself.
 *
 * The workings are in jam.ts. In a Jam this is the room: the song with who
 * picked it, who is listening, songs to add without leaving, and the one
 * shared queue, which anyone can drag into a new order or trim. The code card
 * wears one of the Recap's palettes, because the code is the thing to share.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import {C, S} from '../theme';
import {BOTTOM_INSET} from '../layout';
import {BRIGHT_PALS} from '../brandArt';
import {useStoreValue} from '../storage';
import {
  addToJam,
  codeFrom,
  joinJam,
  leaveJam,
  memberName,
  moveInJam,
  playInJam,
  removeFromJam,
  savedName,
  startJam,
  useJam,
  type JamView,
} from '../jam';
import {search, type Track} from '../backend';
import {useProgress} from '../player';
import {getBestArtworkUrl, normalizeTracks, thumbArtwork} from '../tracks';
import {toast} from '../toast';
import {useBackPress} from '../useBackPress';
import {TitleBar} from '../components/TitleBar';
import {Check, GripVertical, Plus, Search, X} from '../icons';
import {ConfirmModal} from '../components/ConfirmModal';

type QueueRow = JamView['queue'][number];

export function JamScreen({onClose}: {onClose: () => void}) {
  const jam = useJam();
  useBackPress(onClose);
  return (
    <View style={styles.wrap}>
      <TitleBar title="Jam" onBack={onClose} />
      {jam ? <Room jam={jam} /> : <Lobby />}
    </View>
  );
}

function Lobby() {
  const name = useStoreValue(savedName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await startJam(name);
    } catch {
      toast('Could not start a Jam. Check your connection.');
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    setBusy(true);
    try {
      const ok = await joinJam(code, name);
      if (!ok) {
        toast('No Jam with that code. Check it and try again.');
      }
    } catch {
      toast('Could not join. Check your connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <Text style={styles.lede}>
        Listen to the same songs at the same moment as your friends, each on
        their own phone. Everyone in a Jam can play, pause, skip and add songs.
        Friends need Relaxify too.
      </Text>

      <Text style={styles.label}>
        Your name in the Jam <Text style={styles.optional}>(optional)</Text>
      </Text>
      <TextInput
        value={name}
        onChangeText={v => savedName.set(v.slice(0, 24))}
        placeholder="Your phone's name is used if empty"
        placeholderTextColor={C.faint}
        style={styles.input}
      />

      <TouchableOpacity
        style={[styles.primary, busy && styles.dim]}
        onPress={start}
        disabled={busy}
        activeOpacity={0.85}>
        {busy ? (
          <ActivityIndicator color={C.bg} />
        ) : (
          <Text style={styles.primaryText}>Start a Jam</Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.label, styles.gap]}>Or join with a code</Text>
      <View style={styles.joinRow}>
        <TextInput
          value={code}
          // Not maxLength: it cut a pasted "K7QX-2M" to "K7QX-2" before the
          // dash could be taken out. codeFrom keeps six.
          onChangeText={v => setCode(codeFrom(v))}
          placeholder="K7QX2M"
          placeholderTextColor={C.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, styles.codeInput]}
        />
        <TouchableOpacity
          style={[styles.secondary, (busy || code.length < 6) && styles.dim]}
          onPress={join}
          disabled={busy || code.length < 6}
          activeOpacity={0.85}>
          <Text style={styles.secondaryText}>Join</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>
        While a Jam runs, the song, where it is, the Jam queue and the names you
        enter are shared through our database, so the phones can follow each
        other. They are deleted when the Jam ends.
      </Text>
    </ScrollView>
  );
}

/** A tapped song plays for everyone in the Jam, now. */
function play(t: Track, key?: string) {
  playInJam(t, key).catch(() =>
    toast("Couldn't play that song. Check your connection."),
  );
}

function Room({jam}: {jam: JamView}) {
  const renderItem = useCallback(
    ({item, drag, isActive}: RenderItemParams<QueueRow>) => (
      <ScaleDecorator activeScale={1.02}>
        <View style={[styles.queueRow, isActive && styles.lifted]}>
          <TouchableOpacity
            onPressIn={drag}
            hitSlop={8}
            accessibilityLabel="Drag to reorder">
            <GripVertical size={20} color={C.faint} />
          </TouchableOpacity>
          <SongRow
            art={thumbArtwork(getBestArtworkUrl(item.track))}
            title={item.track.title}
            sub={`Added by ${item.by}`}
            onPress={() => play(item.track, item.key)}
          />
          <TouchableOpacity
            onPress={() => removeFromJam(item.key)}
            hitSlop={10}
            accessibilityLabel={`Remove ${item.track.title}`}>
            <X size={18} color={C.faint} />
          </TouchableOpacity>
        </View>
      </ScaleDecorator>
    ),
    [],
  );

  return (
    <DraggableFlatList
      data={jam.queue}
      keyExtractor={q => q.key}
      renderItem={renderItem}
      onDragEnd={({from, to}) => moveInJam(from, to)}
      activationDistance={6}
      keyboardShouldPersistTaps="handled"
      containerStyle={styles.wrap}
      contentContainerStyle={styles.body}
      ListHeaderComponent={<RoomHead jam={jam} />}
      ListEmptyComponent={
        <Text style={styles.note}>
          Nothing queued. Add songs above, or swipe any song right.
        </Text>
      }
      ListFooterComponent={<RoomFoot jam={jam} />}
    />
  );
}

function RoomHead({jam}: {jam: JamView}) {
  const pal = BRIGHT_PALS[0];
  const now = jam.now;
  const picked = now ? memberName(now.by) : '';
  return (
    <View style={styles.head}>
      {now ? <Hero jam={jam} /> : null}
      {picked ? (
        <Text style={styles.picked}>{`Picked by ${picked}`}</Text>
      ) : null}

      <View style={styles.people}>
        {(jam.members.length ? jam.members : [{id: jam.me, name: 'You'}]).map(
          (m, i) => {
            const p = BRIGHT_PALS[i % BRIGHT_PALS.length];
            return (
              <View key={m.id} style={[styles.person, {backgroundColor: p.bg}]}>
                <Text style={[styles.personText, {color: p.ink}]}>
                  {m.id === jam.me ? `${m.name} (you)` : m.name}
                </Text>
              </View>
            );
          },
        )}
      </View>

      <View style={[styles.codeCard, {backgroundColor: pal.bg}]}>
        <View>
          <Text style={[styles.codeLabel, {color: pal.ink}]}>Jam code</Text>
          <Text style={[styles.code, {color: pal.ink}]} selectable>
            {jam.code}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.share, {backgroundColor: pal.ink}]}
          onPress={() =>
            Share.share({
              message: `Join my Relaxify Jam: open Relaxify, go to Jam, and enter ${jam.code}`,
            }).catch(() => {})
          }>
          <Text style={[styles.shareText, {color: pal.bg}]}>Invite</Text>
        </TouchableOpacity>
      </View>

      <AddSongs />

      <Text style={[styles.label, styles.gap]}>Up next</Text>
    </View>
  );
}

/** The Jam's song, large, with where it is. */
function Hero({jam}: {jam: JamView}) {
  const now = jam.now!;
  const {position, duration} = useProgress(1000);
  const total = duration || (now.track.duration_ms ?? 0) / 1000;
  const pct = total > 0 ? Math.min(1, position / total) : 0;
  const art = getBestArtworkUrl(now.track);
  return (
    <View style={styles.hero}>
      {art ? (
        <Image source={{uri: art}} style={styles.heroArt} />
      ) : (
        <View style={[styles.heroArt, styles.artEmpty]} />
      )}
      <Text style={styles.heroTitle} numberOfLines={1}>
        {now.track.title}
      </Text>
      <Text style={styles.heroSub} numberOfLines={1}>
        {now.track.artist}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, {width: `${pct * 100}%`}]} />
      </View>
    </View>
  );
}

/** Search without leaving the room. */
function AddSongs() {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  /** Songs added from this search: their + becomes a tick, so a second tap
   *  does not queue the same song twice for everyone. */
  const [added, setAdded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) {
      setFound([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      setBusy(true);
      search(text, 6)
        .then(r => live && setFound(normalizeTracks(r)))
        .catch(() => live && setFound([]))
        .finally(() => live && setBusy(false));
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const keyOf = (t: Track) => `${t.title}|${t.artist}`;
  const add = (t: Track) => {
    const k = keyOf(t);
    setAdded(prev => new Set(prev).add(k));
    addToJam(t)
      .then(() => toast(`Added "${t.title}" to the Jam`))
      .catch(() => {
        setAdded(prev => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
        toast("Couldn't add that song. Check your connection.");
      });
  };

  return (
    <View style={styles.add}>
      <View style={styles.searchBox}>
        <Search size={18} color={C.faint} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Add a song to the Jam"
          placeholderTextColor={C.faint}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {busy ? <ActivityIndicator size="small" color={C.faint} /> : null}
        {q ? (
          <TouchableOpacity
            onPress={() => {
              setQ('');
              Keyboard.dismiss();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear the search">
            <X size={18} color={C.faint} />
          </TouchableOpacity>
        ) : null}
      </View>
      {found.map(t => (
        <View key={keyOf(t)} style={styles.found}>
          <SongRow
            art={thumbArtwork(getBestArtworkUrl(t))}
            title={t.title}
            sub={t.artist}
            onPress={() => play(t)}
          />
          {added.has(keyOf(t)) ? (
            <View accessibilityLabel={`${t.title} is in the Jam`}>
              <Check size={22} color={C.accent} />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => add(t)}
              hitSlop={10}
              accessibilityLabel={`Add ${t.title} to the Jam`}>
              <Plus size={22} color={C.text} />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

function RoomFoot({jam}: {jam: JamView}) {
  // Ending stops the music on every phone in it: asked first. Leaving only
  // takes this phone out, and the code still lets it back in.
  const [asking, setAsking] = useState(false);
  const leave = () => leaveJam().catch(() => {});
  return (
    // No "Then" row: it was this phone's next song (a radio pick, mostly),
    // shown under the Jam's own "Up next", so two lists answered "what's
    // next" differently, and it arrived late and moved the button below it.
    // The Jam still shares that song (now.next) so phones can load it early.
    <View>
      <TouchableOpacity
        style={styles.leave}
        onPress={() => (jam.host ? setAsking(true) : leave())}
        activeOpacity={0.8}>
        <Text style={styles.leaveText}>
          {jam.host ? 'End the Jam for everyone' : 'Leave the Jam'}
        </Text>
      </TouchableOpacity>
      <ConfirmModal
        visible={asking}
        title="End the Jam?"
        message="The music stops for everyone in it, and the code stops working."
        confirmLabel="End Jam"
        danger
        onConfirm={() => {
          setAsking(false);
          leave();
        }}
        onCancel={() => setAsking(false)}
      />
    </View>
  );
}

function SongRow({
  art,
  title,
  sub,
  onPress,
}: {
  art?: string;
  title: string;
  sub: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.song}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `Play ${title} in the Jam` : undefined}>
      {art ? (
        <Image source={{uri: art}} style={styles.art} />
      ) : (
        <View style={[styles.art, styles.artEmpty]} />
      )}
      <View style={styles.songText}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.songSub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  body: {padding: S.gutter, paddingBottom: BOTTOM_INSET + 20, gap: 10},
  head: {gap: 10},
  lede: {color: C.sub, fontSize: 14.5, lineHeight: 21, marginBottom: 8},
  label: {color: C.text, fontSize: 13.5, fontWeight: '700'},
  optional: {color: C.faint, fontWeight: '600'},
  gap: {marginTop: 14},
  input: {
    backgroundColor: C.surfaceHi,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 46,
    color: C.text,
    fontSize: 15,
  },
  codeInput: {flex: 1, fontFamily: 'monospace', letterSpacing: 3},
  primary: {
    height: 48,
    borderRadius: 999,
    backgroundColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryText: {color: C.bg, fontSize: 15.5, fontWeight: '700'},
  joinRow: {flexDirection: 'row', gap: 10},
  secondary: {
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {color: C.text, fontSize: 15, fontWeight: '700'},
  dim: {opacity: 0.5},
  note: {color: C.faint, fontSize: 12.5, lineHeight: 18, marginTop: 6},
  hero: {alignItems: 'center', gap: 4, marginTop: 4},
  heroArt: {
    width: 220,
    height: 220,
    borderRadius: 12,
    backgroundColor: C.surface,
    marginBottom: 10,
  },
  heroTitle: {color: C.text, fontSize: 22, fontWeight: '700', maxWidth: '100%'},
  heroSub: {color: C.sub, fontSize: 14.5, maxWidth: '100%'},
  bar: {
    alignSelf: 'stretch',
    height: 4,
    borderRadius: 2,
    backgroundColor: C.surfaceHi,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: {height: 4, backgroundColor: C.text},
  picked: {color: C.faint, fontSize: 12.5, textAlign: 'center'},
  people: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6},
  person: {borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6},
  personText: {fontSize: 13, fontWeight: '700'},
  codeCard: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  codeLabel: {fontSize: 12, fontWeight: '700'},
  code: {
    fontFamily: 'monospace',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 5,
  },
  share: {borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8},
  shareText: {fontSize: 14, fontWeight: '700'},
  add: {gap: 8, marginTop: 10},
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surfaceHi,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  searchInput: {flex: 1, color: C.text, fontSize: 15},
  found: {flexDirection: 'row', alignItems: 'center', gap: 10},
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    backgroundColor: C.bg,
  },
  lifted: {backgroundColor: C.surfaceHi, borderRadius: 8},
  song: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12},
  art: {width: 48, height: 48, borderRadius: 6, backgroundColor: C.surface},
  artEmpty: {backgroundColor: C.surfaceHi},
  songText: {flex: 1, minWidth: 0},
  songTitle: {color: C.text, fontSize: 15, fontWeight: '700'},
  songSub: {color: C.sub, fontSize: 12.5, marginTop: 2},
  // Filled red: ending a Jam stops it for everyone in it.
  leave: {
    marginTop: 26,
    alignSelf: 'flex-start',
    backgroundColor: C.danger,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  leaveText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});
