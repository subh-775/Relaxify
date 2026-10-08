/**
 * First open only: three cards on what Relaxify does, then the languages Home
 * is drawn from. Swiped or stepped with Next; Skip or back ends it at once.
 *
 * People who were already using the app before this existed never see it
 * (settleWelcome marks them done on their first start with it).
 */
import React, {useEffect, useRef, useState} from 'react';
import {
  BackHandler,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {C, S} from '../theme';
import {CARD_PALS, PALS, blob, burst, sparkle, type Pal} from '../brandArt';
import {createStore, useStoreValue} from '../storage';
import {readStats} from '../stats';
import {LanguageChips} from '../components/LanguageChips';
import {logEvent} from '../analytics';

const welcomed = createStore<boolean>('mp.welcomed.v1', false, raw => raw === true);

export const useWelcomed = () => useStoreValue(welcomed);

/** After hydration: anyone with plays already is not new, so skip them. */
export function settleWelcome(): void {
  if (!welcomed.get() && readStats().plays > 0) {
    welcomed.set(true);
  }
}

type Page = {pal: Pal; kicker: string; title: string; body: string; art: 'burst' | 'blob' | 'rings'};

const PAGES: Page[] = [
  {
    pal: PALS[0],
    kicker: 'Search anything',
    title: 'Every song, one search',
    body: 'JioSaavn and SoundCloud together, and YouTube too if you switch it on in Settings.',
    art: 'burst',
  },
  {
    pal: CARD_PALS.import,
    kicker: 'Bring your playlists',
    title: 'Your playlists, moved in',
    body: 'Paste a Spotify or YouTube playlist link on Home. Relaxify finds each song and saves the playlist to your Library.',
    art: 'blob',
  },
  {
    pal: CARD_PALS.jam,
    kicker: 'Listen together',
    title: 'Same song, same second',
    body: 'Start a Jam from the menu and friends on their own phones hear exactly what you hear.',
    art: 'rings',
  },
];

const ART = 260;
const H = ART / 2;

function PageArt({p, kind}: {p: Pal; kind: Page['art']}) {
  return (
    <Svg width={ART} height={ART}>
      {kind === 'burst' && (
        <>
          <Path d={burst(H, H, 118, 78, 14)} fill={p.ink} />
          <Circle cx={H} cy={H} r={44} fill={p.a} />
          <Path d={sparkle(H + 70, H - 80, 22)} fill={p.c} />
        </>
      )}
      {kind === 'blob' && (
        <>
          <Path d={blob(H, H, 110, 0.18, 8, 3)} fill={p.ink} />
          <Path d={blob(H - 10, H + 6, 56, 0.2, 7, 9)} fill={p.a} />
          <Circle cx={H + 58} cy={H - 58} r={20} fill={p.c} />
        </>
      )}
      {kind === 'rings' && (
        <>
          {[0, 1, 2, 3].map(i => (
            <Circle
              key={i}
              cx={H}
              cy={H}
              r={40 + i * 26}
              fill="none"
              stroke={p.ink}
              strokeWidth={4}
              opacity={0.6 - i * 0.12}
            />
          ))}
          <Circle cx={H - 20} cy={H - 18} r={26} fill={p.a} />
          <Circle cx={H + 22} cy={H - 12} r={26} fill={p.b} />
          <Circle cx={H} cy={H + 22} r={26} fill={p.c} />
        </>
      )}
    </Svg>
  );
}

export function WelcomeScreen() {
  const {width} = useWindowDimensions();
  const list = useRef<FlatList<number>>(null);
  const [at, setAt] = useState(0);
  const last = PAGES.length; // the languages page

  const finish = (how: 'done' | 'skip') => {
    logEvent('welcome_finished', {how, page: at});
    welcomed.set(true);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finishRef.current('skip');
      return true;
    });
    return () => sub.remove();
  }, []);

  const go = (i: number) => {
    list.current?.scrollToIndex({index: i, animated: true});
    setAt(i);
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setAt(Math.round(e.nativeEvent.contentOffset.x / width));

  const pal = at < last ? PAGES[at].pal : null;
  const ink = pal ? pal.ink : C.text;

  return (
    <View style={[styles.wrap, {backgroundColor: pal ? pal.bg : C.bg}]}>
      <FlatList
        ref={list}
        data={[0, 1, 2, 3]}
        keyExtractor={String}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, i) => ({length: width, offset: width * i, index: i})}
        renderItem={({item: i}) =>
          i < last ? (
            <View style={[styles.page, {width}]}>
              <View style={styles.art}>
                <PageArt p={PAGES[i].pal} kind={PAGES[i].art} />
              </View>
              <Text style={[styles.kicker, {color: PAGES[i].pal.ink}]}>
                {PAGES[i].kicker}
              </Text>
              <Text style={[styles.title, {color: PAGES[i].pal.ink}]}>{PAGES[i].title}</Text>
              <Text style={[styles.body, {color: PAGES[i].pal.ink}]}>{PAGES[i].body}</Text>
            </View>
          ) : (
            // Scrolls only on a phone too short for the sixteen tiles.
            <ScrollView
              style={{width}}
              contentContainerStyle={styles.langPage}
              showsVerticalScrollIndicator={false}>
              <Text style={[styles.kicker, styles.onDark]}>One last thing</Text>
              <Text style={[styles.title, styles.onDark]}>What do you listen to?</Text>
              <Text style={[styles.body, styles.sub]}>
                Pick up to two. Home and Browse are drawn from these; Search always
                covers everything, and you can change them in Settings.
              </Text>
              <LanguageChips />
            </ScrollView>
          )
        }
      />

      {at < last && (
        <TouchableOpacity
          style={styles.skip}
          onPress={() => finish('skip')}
          hitSlop={12}
          accessibilityRole="button">
          <Text style={[styles.skipText, {color: ink}]}>Skip</Text>
        </TouchableOpacity>
      )}

      <View style={styles.foot}>
        <View style={styles.dots}>
          {[0, 1, 2, 3].map(i => (
            <View
              key={i}
              style={[
                styles.dot,
                {backgroundColor: ink},
                i === at ? styles.dotOn : styles.dotOff,
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.next, {backgroundColor: pal ? pal.ink : C.accent}]}
          onPress={() => (at < last ? go(at + 1) : finish('done'))}
          activeOpacity={0.85}
          accessibilityRole="button">
          <Text style={[styles.nextText, {color: pal ? pal.bg : C.bg}]}>
            {at < last ? 'Next' : 'Start listening'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {...StyleSheet.absoluteFillObject, zIndex: 10000},
  page: {flex: 1, paddingHorizontal: S.gutter + 6, justifyContent: 'center'},
  langPage: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: S.gutter + 6,
    paddingVertical: 56,
  },
  art: {alignSelf: 'center', marginBottom: 36},
  kicker: {fontSize: 15, fontWeight: '800', marginBottom: 6},
  title: {fontSize: 40, lineHeight: 43, fontWeight: '800', letterSpacing: -1.6},
  body: {fontSize: 16, lineHeight: 23, marginTop: 14, marginBottom: 18, fontWeight: '600'},
  onDark: {color: C.text},
  sub: {color: C.sub},
  skip: {position: 'absolute', top: 18, right: S.gutter + 4},
  skipText: {fontSize: 15, fontWeight: '800'},
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.gutter + 6,
    paddingBottom: 28,
  },
  dots: {flexDirection: 'row', gap: 6},
  dot: {height: 8, borderRadius: 4},
  dotOn: {width: 22},
  dotOff: {width: 8, opacity: 0.35},
  next: {borderRadius: 999, paddingHorizontal: 26, paddingVertical: 14},
  nextText: {fontSize: 16, fontWeight: '800'},
});
