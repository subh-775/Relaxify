/**
 * A shape for each of Home's rows, matched to what is in it:
 *
 *   Trending now   Ranked: the order is the point, so big outlined numbers
 *                  stand behind the covers.
 *   New releases   Hero carousel: one wide card at a time, lit by its own
 *                  cover's colour, snapping to each.
 *   Charts         Colour cards: tall cards whose base takes the cover's
 *                  colour, so each chart reads as its own poster.
 *   Top playlists  Two-row shelf: twice as many on screen, for browsing.
 *
 * Anything else keeps HomeScreen's plain strip. The rank numbers are SVG text,
 * because an outline is something a React Native Text cannot draw.
 */
import React from 'react';
import {
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {C, S, T} from '../theme';
import {FONT} from '../font';
import {Play} from '../icons';
import {upgradeArtwork} from '../tracks';
import {surfaceTint, useArtworkColor} from '../artworkColor';
import type {HomeItem, HomeRow} from '../backend';

type Props = {row: HomeRow; onPick: (i: HomeItem) => void};

const key = (i: HomeItem) => i.perma_url || `${i.type}|${i.title || i.name}`;
const label = (i: HomeItem) => i.title || i.name || 'Untitled';

function Cover({item, size, radius = S.radius}: {item: HomeItem; size: number; radius?: number}) {
  return item.image ? (
    <Image
      source={{uri: upgradeArtwork(item.image)}}
      style={{width: size, height: size, borderRadius: radius}}
    />
  ) : (
    <View style={[styles.empty, {width: size, height: size, borderRadius: radius}]} />
  );
}

function Title({text, sub}: {text: string; sub?: string}) {
  return (
    <>
      <Text style={styles.title} numberOfLines={1}>
        {text}
      </Text>
      {!!sub && (
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      )}
    </>
  );
}

function Header({title, note}: {title: string; note?: string}) {
  return (
    <View style={styles.head}>
      <Text style={styles.rowTitle}>{title}</Text>
      {!!note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

// ── Ranked ───────────────────────────────────────────────────────────────
const RANK_COVER = 118;
export function RankedRow({row, onPick}: Props) {
  const items = row.items.slice(0, 10);
  return (
    <View style={styles.row}>
      <Header title={row.title} note={`Top ${items.length}`} />
      <FlatList
        horizontal
        data={items}
        keyExtractor={key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({item, index}) => (
          <TouchableOpacity
            style={styles.rank}
            activeOpacity={0.75}
            onPress={() => onPick(item)}
            accessibilityLabel={`Number ${index + 1}, ${label(item)}`}>
            <Svg width={index >= 9 ? 104 : 64} height={RANK_COVER} style={styles.num}>
              <SvgText
                x={index >= 9 ? 104 : 64}
                y={RANK_COVER}
                textAnchor="end"
                fontFamily={FONT}
                fontSize="118"
                fontWeight="800"
                fill={C.bg}
                stroke="#d6d6dc"
                strokeWidth={3}>
                {String(index + 1)}
              </SvgText>
            </Svg>
            <View style={styles.rankCard}>
              <Cover item={item} size={RANK_COVER} />
              <Title text={label(item)} sub={item.subtitle} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// ── Hero carousel ────────────────────────────────────────────────────────
const HERO_H = 172;
function HeroCard({item, width, onPick}: {item: HomeItem; width: number; onPick: Props['onPick']}) {
  const tint = useArtworkColor(item.image ? upgradeArtwork(item.image) : undefined);
  const glow = tint ? surfaceTint(tint, 0.42, 0.7) : C.surfaceHi;
  const deep = tint ? surfaceTint(tint, 0.14) : C.surface;
  const id = `hero${key(item).replace(/[^a-z0-9]/gi, '').slice(-12)}`;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPick(item)}
      style={[styles.hero, {width}]}
      accessibilityLabel={label(item)}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id={id} cx="20%" cy="100%" rx="120%" ry="90%">
            <Stop offset="0" stopColor={glow} />
            <Stop offset="0.75" stopColor={deep} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <View style={styles.heroCover}>
        <Cover item={item} size={96} />
      </View>
      <View style={styles.heroText}>
        <Text style={styles.heroTitle} numberOfLines={2}>
          {label(item)}
        </Text>
        {!!item.subtitle && (
          <Text style={styles.heroSub} numberOfLines={1}>
            {item.subtitle}
          </Text>
        )}
      </View>
      <View style={styles.heroPlay}>
        <Play size={17} color={C.bg} fill={C.bg} />
      </View>
    </TouchableOpacity>
  );
}

export function HeroRow({row, onPick}: Props) {
  const {width} = useWindowDimensions();
  const cardW = Math.min(320, width - 2 * S.gutter - 24);
  return (
    <View style={styles.row}>
      <Header title={row.title} />
      <FlatList
        horizontal
        data={row.items}
        keyExtractor={key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        snapToInterval={cardW + S.gap}
        snapToAlignment="start"
        decelerationRate="fast"
        renderItem={({item}) => <HeroCard item={item} width={cardW} onPick={onPick} />}
      />
    </View>
  );
}

// ── Colour cards ─────────────────────────────────────────────────────────
const TALL_W = 150;
function ColourCard({item, onPick}: {item: HomeItem; onPick: Props['onPick']}) {
  const tint = useArtworkColor(item.image ? upgradeArtwork(item.image) : undefined);
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPick(item)}
      style={styles.tall}
      accessibilityLabel={label(item)}>
      <Cover item={item} size={TALL_W} radius={0} />
      <View style={[styles.tallBase, {backgroundColor: tint ? surfaceTint(tint, 0.26, 0.6) : C.surfaceHi}]}>
        <Text style={styles.tallTitle} numberOfLines={2}>
          {label(item)}
        </Text>
        {!!item.subtitle && (
          <Text style={styles.tallSub} numberOfLines={1}>
            {item.subtitle}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function ColourRow({row, onPick}: Props) {
  return (
    <View style={styles.row}>
      <Header title={row.title} />
      <FlatList
        horizontal
        data={row.items}
        keyExtractor={key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({item}) => <ColourCard item={item} onPick={onPick} />}
      />
    </View>
  );
}

// ── Two-row shelf ────────────────────────────────────────────────────────
const SHELF = 104;
export function ShelfRow({row, onPick}: Props) {
  const columns: HomeItem[][] = [];
  for (let i = 0; i < row.items.length; i += 2) {
    columns.push(row.items.slice(i, i + 2));
  }
  return (
    <View style={styles.row}>
      <Header title={row.title} />
      <FlatList
        horizontal
        data={columns}
        keyExtractor={col => col.map(key).join('+')}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({item: col}) => (
          <View style={styles.shelfCol}>
            {col.map(item => (
              <TouchableOpacity
                key={key(item)}
                activeOpacity={0.75}
                onPress={() => onPick(item)}
                style={styles.shelfItem}
                accessibilityLabel={label(item)}>
                <Cover item={item} size={SHELF} />
                <Text style={styles.shelfTitle} numberOfLines={1}>
                  {label(item)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      />
    </View>
  );
}

/** The shape for a row by its title, or null for the plain strip. */
export function shapedRow(title: string): React.ComponentType<Props> | null {
  switch (title.trim().toLowerCase()) {
    case 'trending now':
      return RankedRow;
    case 'new releases':
      return HeroRow;
    case 'charts':
      return ColourRow;
    case 'top playlists':
      return ShelfRow;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  row: {marginTop: 22},
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: S.gutter,
    marginBottom: 10,
  },
  rowTitle: {...T.rowTitle, color: C.text},
  note: {color: C.sub, fontSize: 12.5, fontWeight: '700'},
  list: {paddingHorizontal: S.gutter, gap: S.gap},
  empty: {backgroundColor: C.surfaceHi},
  title: {...T.body, color: C.text, marginTop: 8, lineHeight: 18},
  sub: {...T.sub, color: C.sub, marginTop: 2},
  rank: {flexDirection: 'row', alignItems: 'flex-start'},
  num: {marginRight: -14, zIndex: 0},
  rankCard: {width: RANK_COVER, zIndex: 1},
  hero: {
    height: HERO_H,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 14,
    gap: 12,
  },
  heroCover: {
    borderRadius: S.radius,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 6},
  },
  heroText: {flex: 1, minWidth: 0},
  heroTitle: {color: C.text, fontSize: 17, lineHeight: 21, fontWeight: '800'},
  heroSub: {color: 'rgba(255,255,255,0.8)', fontSize: 12.5, marginTop: 3},
  heroPlay: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  tall: {width: TALL_W, borderRadius: 12, overflow: 'hidden', backgroundColor: C.surface},
  tallBase: {padding: 10, minHeight: 70},
  tallTitle: {color: C.text, fontSize: 13.5, fontWeight: '800', lineHeight: 17},
  tallSub: {color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3},
  shelfCol: {gap: 12},
  shelfItem: {width: SHELF},
  shelfTitle: {color: C.text, fontSize: 12.5, fontWeight: '700', marginTop: 5},
});
