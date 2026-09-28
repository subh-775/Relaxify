/**
 * Jam: start one, join one with a code, and see who is in it.
 *
 * The workings are in jam.ts; this screen only starts, joins, shows and
 * leaves. The code card wears one of the Recap's palettes, the one bright
 * thing on an otherwise plain page, because the code is the thing to share.
 */
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {ChevronLeft} from '../icons';
import {C, S, T} from '../theme';
import {BOTTOM_INSET} from '../layout';
import {BRIGHT_PALS} from '../brandArt';
import {createStore, useStoreValue} from '../storage';
import {joinJam, leaveJam, startJam, useJam} from '../jam';
import {getBestArtworkUrl} from '../tracks';
import {toast} from '../toast';

const savedName = createStore<string>('mp.jamName.v1', '', raw =>
  typeof raw === 'string' ? raw : '',
);

export function JamScreen({onClose}: {onClose: () => void}) {
  const jam = useJam();
  const name = useStoreValue(savedName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

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

  const pal = BRIGHT_PALS[0];

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.back}>
          <ChevronLeft size={28} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.barTitle}>Jam</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        {!jam ? (
          <>
            <Text style={styles.lede}>
              Listen to the same songs at the same moment as your friends, each
              on their own phone. Everyone in a Jam can play, pause, skip and
              add songs. Friends need Relaxify too.
            </Text>

            <Text style={styles.label}>Your name in the Jam</Text>
            <TextInput
              value={name}
              onChangeText={v => savedName.set(v.slice(0, 24))}
              placeholder="Your name"
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
                onChangeText={v => setCode(v.toUpperCase())}
                placeholder="K7QX2M"
                placeholderTextColor={C.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
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
              While a Jam runs, the song, where it is, the Jam queue and the
              names you enter are shared through our database, so the phones can
              follow each other. They are deleted when the Jam ends.
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.codeCard, {backgroundColor: pal.bg}]}>
              <Text style={[styles.codeLabel, {color: pal.ink}]}>
                Share this code
              </Text>
              <Text style={[styles.code, {color: pal.ink}]} selectable>
                {jam.code}
              </Text>
              <TouchableOpacity
                style={[styles.share, {backgroundColor: pal.ink}]}
                onPress={() =>
                  Share.share({
                    message: `Join my Relaxify Jam with the code ${jam.code}`,
                  }).catch(() => {})
                }>
                <Text style={[styles.shareText, {color: pal.bg}]}>Share code</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              {`${jam.members.length || 1} ${
                (jam.members.length || 1) === 1 ? 'phone' : 'phones'
              } listening`}
            </Text>
            <Text style={styles.members}>
              {jam.members.map(m => (m.id === jam.me ? `${m.name} (you)` : m.name)).join(', ') ||
                'Just you so far'}
            </Text>

            {jam.now && (
              <>
                <Text style={[styles.label, styles.gap]}>Playing</Text>
                <SongRow
                  art={getBestArtworkUrl(jam.now.track)}
                  title={jam.now.track.title}
                  sub={jam.now.track.artist}
                />
              </>
            )}

            <Text style={[styles.label, styles.gap]}>Up next in the Jam</Text>
            {jam.queue.length ? (
              jam.queue.map(q => (
                <SongRow
                  key={q.key}
                  art={getBestArtworkUrl(q.track)}
                  title={q.track.title}
                  sub={`Added by ${q.by}`}
                />
              ))
            ) : (
              <Text style={styles.note}>
                Add songs from any song&apos;s menu: Add to Jam queue.
              </Text>
            )}

            <TouchableOpacity
              style={styles.leave}
              onPress={() => leaveJam().catch(() => {})}
              activeOpacity={0.8}>
              <Text style={styles.leaveText}>
                {jam.host ? 'End the Jam for everyone' : 'Leave the Jam'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SongRow({art, title, sub}: {art?: string; title: string; sub: string}) {
  return (
    <View style={styles.song}>
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
  body: {padding: S.gutter, paddingBottom: BOTTOM_INSET + 20, gap: 10},
  lede: {color: C.sub, fontSize: 14.5, lineHeight: 21, marginBottom: 8},
  label: {color: C.text, fontSize: 13.5, fontWeight: '800'},
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
  primaryText: {color: C.bg, fontSize: 15.5, fontWeight: '800'},
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
  secondaryText: {color: C.text, fontSize: 15, fontWeight: '800'},
  dim: {opacity: 0.5},
  note: {color: C.faint, fontSize: 12.5, lineHeight: 18, marginTop: 6},
  codeCard: {borderRadius: 18, padding: 18, alignItems: 'center', gap: 8},
  codeLabel: {fontSize: 13, fontWeight: '800'},
  code: {
    fontFamily: 'monospace',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 8,
  },
  share: {borderRadius: 999, paddingHorizontal: 18, paddingVertical: 8},
  shareText: {fontSize: 14, fontWeight: '800'},
  members: {color: C.sub, fontSize: 14},
  song: {flexDirection: 'row', alignItems: 'center', gap: 12},
  art: {width: 48, height: 48, borderRadius: 6, backgroundColor: C.surface},
  artEmpty: {backgroundColor: C.surfaceHi},
  songText: {flex: 1, minWidth: 0},
  songTitle: {color: C.text, fontSize: 15, fontWeight: '700'},
  songSub: {color: C.sub, fontSize: 12.5, marginTop: 2},
  leave: {marginTop: 26, paddingVertical: 12},
  leaveText: {color: C.danger, fontSize: 15, fontWeight: '800'},
});
