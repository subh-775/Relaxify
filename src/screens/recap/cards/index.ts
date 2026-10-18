/**
 * The Recap's cards, in the order they play. Each card is its own file and
 * returns null when there is nothing to say (no top artist yet, no streak).
 */
import type {ArtistCount, Recap} from '../../../recap';
import type {Card} from '../art';
import type {CardContext} from './context';
import {emptyCard} from './Empty';
import {introCard} from './Intro';
import {topSongCard} from './TopSong';
import {topSongsCard} from './TopSongs';
import {topArtistCard} from './TopArtist';
import {topArtistsCard} from './TopArtists';
import {listeningTimeCard} from './ListeningTime';
import {lastWeekCard} from './LastWeek';
import {onRepeatCard} from './OnRepeat';
import {discoveriesCard} from './Discoveries';
import {personaCard} from './Persona';
import {streakCard} from './Streak';
import {posterCard} from './Poster';

const CARDS: ((ctx: CardContext) => Card | null)[] = [
  introCard,
  topSongCard,
  topSongsCard,
  topArtistCard,
  topArtistsCard,
  listeningTimeCard,
  lastWeekCard,
  onRepeatCard,
  discoveriesCard,
  personaCard,
  streakCard,
  posterCard,
];

export function buildCards(r: Recap, faces: Record<string, string>): Card[] {
  const week = r.mode === 'week';
  // A real photo when one is known; the stats only ever had a cover.
  const face = (a: ArtistCount) => faces[a.name] || a.image;

  if (!r.songs) {
    return [emptyCard()];
  }

  const ctx: CardContext = {r, week, now: Date.now(), face};
  return CARDS.map(card => card(ctx)).filter((c): c is Card => c !== null);
}
