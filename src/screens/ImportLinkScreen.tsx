/**
 * The way into an import, from Home's "Bring your playlists" card: first that
 * the playlist has to be public (a private one reads as empty, the most common
 * reason an import finds nothing), then the box for its link. Import hands the
 * link to SpotifyImportScreen, which shows the songs as they are found.
 */
import React, {useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {PageBar} from '../components/PageBar';
import {isImportUrl} from '../spotifyImport';
import {toast} from '../toast';

export function ImportLinkScreen({
  onImport,
  onClose,
}: {
  onImport: (url: string) => void;
  onClose: () => void;
}) {
  const [link, setLink] = useState('');
  const url = link.trim();

  const submit = () => {
    if (!isImportUrl(url)) {
      toast("That isn't a Spotify or YouTube playlist link");
      return;
    }
    onImport(url);
  };

  return (
    <View style={styles.wrap}>
      <PageBar title="Import a playlist" onBack={onClose} />
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        overScrollMode="never"
        bounces={false}>
        <Text style={styles.title}>Make sure your playlist is public</Text>
        <Text style={styles.text}>
          Relaxify reads a playlist the way anyone with its link would, so a
          private one comes back empty. If yours is private, make it public in
          Spotify or YouTube first.
        </Text>
        <Text style={styles.text}>
          Each song is then found on JioSaavn, SoundCloud or YouTube and the
          playlist is saved to your Library.
        </Text>

        <Text style={styles.label}>Playlist link</Text>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="Spotify or YouTube playlist link"
          placeholderTextColor={C.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={submit}
          style={styles.input}
          accessibilityLabel="Playlist link"
        />
        <TouchableOpacity
          style={[styles.button, !url && styles.buttonOff]}
          onPress={submit}
          disabled={!url}
          activeOpacity={0.8}
          accessibilityRole="button">
          <Text style={styles.buttonText}>Import</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {flex: 1, backgroundColor: C.bg},
  body: {paddingHorizontal: S.gutter, paddingTop: 26, paddingBottom: 40},
  title: {...T.screenTitle, color: C.text, fontSize: 22, marginBottom: 10},
  text: {color: C.sub, fontSize: 14.5, lineHeight: 21, marginBottom: 10},
  label: {color: C.text, fontSize: 14, fontWeight: '700', marginTop: 18},
  input: {
    marginTop: 8,
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: C.surface,
    paddingHorizontal: 14,
    color: C.text,
    fontSize: 15,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: 16,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  buttonOff: {opacity: 0.4},
  buttonText: {color: '#fff', fontSize: 15, fontWeight: '700'},
});
