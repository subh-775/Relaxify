/**
 * A song's credits: who sings it, who wrote it, whose label it is. Opens when
 * a song's artist credit names several people and you tap it; one name opens
 * that artist's page directly, because a one-item sheet is just an extra tap.
 *
 * The names come from the song itself and show at once. For a JioSaavn song
 * its own record then fills in each artist's role, the composer and lyricist,
 * and the label; any other song shows its artists only.
 *
 * Follow sits on every artist's row. The photo is never shown here, but it is
 * looked up and saved with the follow, so the artist's row in the Library
 * has one.
 */
import React, {useEffect, useState} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {C, S, T} from '../theme';
import {getCredits, type Credits} from '../backend';
import {cleanText} from '../tracks';
import {toggleFollow, useFollowedArtists} from '../artists';
import {useArtistPhotos} from '../artistPhotos';
import {Sheet} from './Sheet';

export type CreditsFor = {
  title: string;
  /** The credit as the song writes it: "A, B & C". */
  credit: string;
  names: string[];
  /** The song's JioSaavn page, which its full credits are looked up by. */
  jiosaavnUrl?: string;
};

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

function CreditsSheetView({
  song,
  onPick,
  onClose,
}: {
  song: CreditsFor | null;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  /**
   * The song held through the close animation: `song` empties the instant a
   * choice is made, and <Sheet> keeps the panel mounted while it slides away,
   * so rendering straight off the prop would show an empty sheet leaving.
   */
  const [shown, setShown] = useState<CreditsFor | null>(song);
  const [credits, setCredits] = useState<Credits>({});
  const followed = useFollowedArtists();
  const photos = useArtistPhotos(shown?.names ?? []);

  useEffect(() => {
    if (!song) {
      return; // closing: keep what is on screen until it has slid away
    }
    setShown(song);
    setCredits({});
    if (!song.jiosaavnUrl) {
      return;
    }
    let alive = true;
    getCredits(song.jiosaavnUrl)
      .then(c => {
        if (alive) {
          setCredits(c);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [song]);

  const roleOf = (name: string) =>
    Object.entries(credits.roles ?? {}).find(([n]) =>
      same(cleanText(n), name),
    )?.[1] ?? 'Artist';
  const names = shown?.names ?? [];
  const writers = credits.writers ?? [];
  const label = cleanText(credits.label ?? '');

  return (
    <Sheet open={!!song} onClose={onClose} style={styles.sheet}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={2}>
          {shown?.title}
        </Text>
        <Text style={styles.credit} numberOfLines={2}>
          {shown?.credit}
        </Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listEnd}
        bounces={false}>
        <Text style={styles.section}>
          {names.length > 1 ? 'Artists' : 'Artist'}
        </Text>
        {names.map(name => {
          const on = followed.some(a => same(a.name, name));
          return (
            <View key={name} style={styles.row}>
              <TouchableOpacity
                style={styles.who}
                activeOpacity={0.6}
                onPress={() => onPick(name)}
                accessibilityRole="button"
                accessibilityHint="Opens the artist">
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.role}>{roleOf(name)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.follow, on && styles.following]}
                activeOpacity={0.7}
                onPress={() => toggleFollow(name, photos[name])}
                accessibilityRole="button"
                accessibilityState={{selected: on}}
                accessibilityLabel={`${on ? 'Following' : 'Follow'} ${name}`}>
                <Text style={styles.followText}>
                  {on ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {writers.length > 0 && (
          <>
            <Text style={[styles.section, styles.later]}>
              Composition and lyrics
            </Text>
            {writers.map(w => (
              <View key={`${w.role}:${w.name}`} style={styles.plain}>
                <Text style={styles.name}>{cleanText(w.name)}</Text>
                <Text style={styles.role}>{w.role}</Text>
              </View>
            ))}
          </>
        )}

        {!!label && (
          <>
            <Text style={[styles.section, styles.later]}>Sources</Text>
            <View style={styles.plain}>
              <Text style={styles.name}>{label}</Text>
              <Text style={styles.role}>Label</Text>
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Scrim, handle, rounded top and the slide all live in <Sheet>.
  sheet: {maxHeight: '80%'},
  head: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: S.gutter,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    color: C.text,
    fontSize: 16.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  credit: {...T.listSub, color: C.sub, textAlign: 'center'},
  list: {flexGrow: 0},
  listEnd: {paddingTop: 6, paddingBottom: 28},
  section: {
    ...T.section,
    color: C.text,
    paddingHorizontal: S.gutter,
    paddingTop: 16,
    paddingBottom: 6,
  },
  later: {paddingTop: 22},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: S.gutter,
    paddingVertical: 10,
  },
  who: {flex: 1, gap: 2},
  plain: {gap: 2, paddingHorizontal: S.gutter, paddingVertical: 10},
  name: {...T.listTitle, color: C.text, fontSize: 16.5},
  role: {...T.listSub, color: C.sub},
  follow: {
    minHeight: 36,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    justifyContent: 'center',
  },
  following: {
    backgroundColor: C.accent,
    borderColor: C.accent,
    paddingHorizontal: 16,
  },
  followText: {color: C.text, fontSize: 14, fontWeight: '700'},
});

/** Memoised: App re-renders often, and each render of a sheet re-publishes
 *  its whole tree into SheetHost. Every prop App passes is stable. */
export const CreditsSheet = React.memo(CreditsSheetView);
