/**
 * Open a friend's shared playlist by its code (Your Library's ticket).
 *
 * One box, not six: a code is six characters, but people paste the whole
 * message a friend sent, and codeIn finds the code inside it either way.
 */
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {openShared} from '../sharedPlaylists';
import type {Collection} from '../collections';
import {Sheet} from './Sheet';

export function OpenSharedSheet({
  open,
  onClose,
  onOpened,
}: {
  open: boolean;
  onClose: () => void;
  /** The followed playlist's id, now in the Library. */
  /** The playlist to preview (not saved until "Add to library"). */
  onOpened: (c: Collection) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setText('');
      setError('');
    }
  }, [open]);

  const go = () => {
    setBusy(true);
    setError('');
    openShared(text)
      .then(c => {
        onClose();
        onOpened(c);
      })
      .catch(e =>
        setError(
          e instanceof Error && !/^Jam /.test(e.message)
            ? e.message
            : 'Could not open it. Check your connection.',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Sheet open={open} onClose={onClose} style={styles.sheet}>
      <Text style={styles.title}>Open a shared playlist</Text>
      <Text style={styles.sub}>
        Enter the code a friend sent you, or paste their whole message.
      </Text>
      <TextInput
        value={text}
        onChangeText={v => setText(v.length > 12 ? v : v.toUpperCase())}
        placeholder="K7QX2M"
        placeholderTextColor={C.faint}
        style={[styles.input, text.length > 12 && styles.inputMessage]}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        onSubmitEditing={go}
      />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.btn, (!text.trim() || busy) && styles.off]}
          disabled={!text.trim() || busy}
          activeOpacity={0.8}
          onPress={go}>
          {busy ? (
            <ActivityIndicator color={C.bg} />
          ) : (
            <Text style={styles.btnText}>Open</Text>
          )}
        </TouchableOpacity>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: {maxHeight: '60%'},
  title: {
    ...T.rowTitle,
    color: C.text,
    fontSize: 19,
    fontWeight: '800',
    paddingHorizontal: S.gutter,
    paddingTop: 12,
  },
  sub: {...T.sub, color: C.sub, paddingHorizontal: S.gutter, paddingTop: 4},
  input: {
    marginHorizontal: S.gutter,
    marginTop: 16,
    color: C.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 5,
    textAlign: 'center',
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 10,
  },
  inputMessage: {fontSize: 14, fontWeight: '500', letterSpacing: 0, textAlign: 'left'},
  error: {
    color: C.danger,
    fontSize: 13.5,
    textAlign: 'center',
    paddingHorizontal: S.gutter,
    paddingTop: 10,
  },
  actions: {alignItems: 'center', paddingTop: 16, paddingBottom: 18},
  btn: {
    minWidth: 120,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: C.text,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  btnText: {color: C.bg, fontSize: 14.5, fontWeight: '800'},
  off: {opacity: 0.4},
});
