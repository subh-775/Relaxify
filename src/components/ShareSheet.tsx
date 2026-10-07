/**
 * Share a playlist of yours: who it is from, and Send.
 *
 * Opening it shares the playlist the first time (sharedPlaylists.ts makes
 * the code and sends the songs); after that it reuses the same link. Friends
 * who open the link see it as it is now and can add a copy to their library,
 * which is then theirs: later changes don't travel either way. No code on
 * screen and no "Stop sharing": the message carries the link, and deleting
 * the playlist is what stops it.
 */
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {readPlaylists, type Playlist} from '../playlists';
import {phoneName, savedName} from '../jam';
import {useStoreValue} from '../storage';
import {shareCodeOf, sharePlaylist} from '../sharedPlaylists';
import {playlistLink} from '../links';
import {Sheet} from './Sheet';

/** What a friend receives. The whole message can be pasted into Search,
 *  which finds the code inside it. */
export function shareMessage(name: string, code: string): string {
  // The link opens the playlist in Relaxify, or offers the app to someone
  // without it.
  return (
    `Listen to "${name}" with me on Relaxify 🎧\n${playlistLink(code)}\n\n` +
    'No app yet? The link gets it for you. Already have it? Paste this ' +
    'message in Search.'
  );
}

export function ShareSheet({
  playlist,
  onClose,
}: {
  playlist: Playlist | null;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const name = useStoreValue(savedName);
  const [nameAtOpen, setNameAtOpen] = useState('');

  // Keyed on the id, not the object: the playlist object is new on every
  // store change, and each new one would share (and send) it again.
  const id = playlist?.id ?? null;
  useEffect(() => {
    const p = id ? readPlaylists().find(x => x.id === id) : undefined;
    if (!p) {
      return;
    }
    let live = true;
    setError('');
    setNameAtOpen(savedName.get());
    setCode(shareCodeOf(p.id));
    sharePlaylist(p)
      .then(c => live && setCode(c))
      .catch(e => {
        if (live && !shareCodeOf(p.id)) {
          setError(
            e instanceof Error && !/^Jam /.test(e.message)
              ? e.message
              : 'Could not share it. Check your connection.',
          );
        }
      });
    return () => {
      live = false;
    };
  }, [id]);

  const close = () => {
    // A new name reaches friends with the songs: send them again.
    const p = id ? readPlaylists().find(x => x.id === id) : undefined;
    if (p && code && savedName.get() !== nameAtOpen) {
      sharePlaylist(p).catch(() => {});
    }
    onClose();
  };

  const send = () => {
    if (playlist && code) {
      Share.share({message: shareMessage(playlist.name, code)}).catch(() => {});
    }
  };

  return (
    <Sheet open={!!playlist} onClose={close} style={styles.sheet}>
      <Text style={styles.title} numberOfLines={1}>
        {`Share ${playlist?.name ?? ''}`}
      </Text>
      <Text style={styles.sub}>
        Friends get it as it is now and can add it to their library. After
        that their copy is theirs, and your changes stay yours.
      </Text>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.nameRow}>
        <Text style={styles.nameLabel}>Shared by</Text>
        <TextInput
          value={name}
          onChangeText={v => savedName.set(v.slice(0, 24))}
          placeholder={phoneName()}
          placeholderTextColor={C.faint}
          style={styles.nameInput}
          maxLength={24}
          returnKeyType="done"
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, styles.btnSolid, !code && styles.off]}
          disabled={!code}
          activeOpacity={0.8}
          onPress={send}>
          {code || error ? (
            <Text style={styles.btnSolidText}>Send…</Text>
          ) : (
            <ActivityIndicator color={C.bg} />
          )}
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {maxHeight: '70%'},
  title: {
    ...T.rowTitle,
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
    paddingHorizontal: S.gutter,
    paddingTop: 12,
  },
  sub: {...T.sub, color: C.sub, paddingHorizontal: S.gutter, paddingTop: 4},
  error: {
    color: C.danger,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: S.gutter,
    paddingVertical: 22,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: S.gutter,
    marginTop: 18,
  },
  nameLabel: {...T.sub, color: C.sub},
  nameInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: S.gutter,
    paddingTop: 18,
    paddingBottom: 18,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 12,
  },
  btnSolid: {backgroundColor: C.text, borderColor: C.text},
  btnSolidText: {color: C.bg, fontSize: 14, fontWeight: '800'},
  off: {opacity: 0.4},
});
