/**
 * The Home cards after Recap: Jam, Spotify import and Continue your mix. All
 * are FeatureCards, the Recap card's exact shape, each on a palette of its own
 * so no two cards in the stack ever match.
 *
 * Each card shows only when it has something to say: Jam always (it is an
 * invitation, or the Jam you are in); the import until the first import has
 * brought songs in; Continue once something has been played from a playlist
 * or album.
 */
import React, {useState} from 'react';
import {Image, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import Svg, {Circle, Path, Rect} from 'react-native-svg';
import {CARD_PALS, type Pal} from '../brandArt';
import {CARD_ART, FeatureCard} from './FeatureCard';
import {useJam} from '../jam';
import {isSpotifyUrl, useImportedOnce} from '../spotifyImport';
import {useLastCollection, type LastCollection} from '../lastCollection';
import {toast} from '../toast';

const JAM_PAL: Pal = CARD_PALS.jam; // lavender
const IMPORT_PAL: Pal = CARD_PALS.import; // lime
const CONTINUE_PAL: Pal = CARD_PALS.continue; // sky

const M = CARD_ART / 2;

export function JamCard({onOpen}: {onOpen: () => void}) {
  const jam = useJam();
  const p = JAM_PAL;
  const listening = jam ? Math.max(1, jam.members.length) : 0;
  return (
    <FeatureCard
      pal={p}
      kicker={
        jam
          ? `In a Jam, ${listening} ${listening === 1 ? 'phone' : 'phones'} listening`
          : 'Listen together'
      }
      title={jam ? jam.code : 'Play the same song with friends'}
      action={jam ? 'Open Jam' : 'Start a Jam'}
      onPress={onOpen}
      art={
        <Svg width={CARD_ART} height={CARD_ART}>
          {[0, 1, 2, 3].map(i => (
            <Circle
              key={i}
              cx={M + 8}
              cy={M - 4}
              r={26 + i * 18}
              fill="none"
              stroke={p.ink}
              strokeWidth={3}
              opacity={0.5 - i * 0.1}
            />
          ))}
          <Circle cx={M - 14} cy={M - 14} r={20} fill={p.a} />
          <Circle cx={M + 16} cy={M - 10} r={20} fill={p.b} />
          <Circle cx={M} cy={M + 16} r={20} fill={p.c} />
        </Svg>
      }
    />
  );
}

export function ImportCard({onImport}: {onImport: (url: string) => void}) {
  const done = useImportedOnce();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  if (done) {
    return null;
  }
  const p = IMPORT_PAL;
  const submit = () => {
    const url = link.trim();
    if (!isSpotifyUrl(url)) {
      toast("That isn't a Spotify playlist or album link");
      return;
    }
    setLink('');
    setOpen(false);
    onImport(url);
  };
  return (
    <FeatureCard
      pal={p}
      kicker="Moving from Spotify?"
      title="Bring your playlists"
      action="Paste a link"
      onPress={() => setOpen(true)}
      art={
        <Svg width={CARD_ART} height={CARD_ART}>
          <Circle cx={M} cy={M} r={46} fill={p.ink} />
          {[0, 1, 2].map(i => (
            <Rect
              key={i}
              x={M - 24}
              y={M - 16 + i * 14}
              width={i === 2 ? 26 : 40}
              height={6}
              rx={3}
              fill={p.bg}
            />
          ))}
          <Path
            d={`M${M + 12},${M + 10} l12,0 m-5,-6 l6,6 l-6,6`}
            stroke={p.bg}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      }
      spin={false}>
      {open ? (
        <View style={styles.pasteRow}>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="open.spotify.com/playlist/…"
            placeholderTextColor="rgba(17,16,20,0.45)"
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
            style={[styles.paste, {borderColor: p.ink, color: p.ink}]}
          />
          <TouchableOpacity
            style={[styles.pasteGo, {backgroundColor: p.ink}]}
            onPress={submit}
            accessibilityRole="button">
            <Text style={[styles.pasteGoText, {color: p.bg}]}>Import</Text>
          </TouchableOpacity>
        </View>
      ) : undefined}
    </FeatureCard>
  );
}

export function ContinueCard({onOpen}: {onOpen: (c: LastCollection) => void}) {
  const last = useLastCollection();
  if (!last) {
    return null;
  }
  const p = CONTINUE_PAL;
  const what =
    last.kind === 'album'
      ? `Album${last.artist ? `, ${last.artist}` : ''}`
      : last.kind === 'liked'
      ? 'Your liked songs'
      : last.kind === 'downloads'
      ? 'Your downloads'
      : 'Playlist';
  return (
    <FeatureCard
      pal={p}
      kicker={`Carry on with · ${what}`}
      title={last.name}
      action={last.kind === 'album' ? 'Open album' : 'Open playlist'}
      onPress={() => onOpen(last)}
      spin={false}
      art={
        <View style={styles.stack}>
          {(last.covers.length ? last.covers : [null]).map((uri, i, all) => (
            <View
              key={`${uri}-${i}`}
              style={[
                styles.cover,
                {
                  right: 34 + (all.length - 1 - i) * 26,
                  transform: [{rotate: `${(i - (all.length - 1) / 2) * 8}deg`}],
                },
              ]}>
              {uri ? (
                <Image source={{uri}} style={styles.coverImg} />
              ) : (
                <View style={[styles.coverImg, {backgroundColor: p.b}]} />
              )}
            </View>
          ))}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  pasteRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  paste: {
    flex: 1,
    height: 36,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  pasteGo: {borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8},
  pasteGoText: {fontSize: 13.5, fontWeight: '800'},
  stack: {width: CARD_ART, height: CARD_ART},
  cover: {
    position: 'absolute',
    top: 56,
    width: 70,
    height: 70,
    borderRadius: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 4},
  },
  coverImg: {width: 70, height: 70, borderRadius: 8},
});
