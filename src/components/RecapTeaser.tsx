/**
 * The Recap's front door on Home: a card in the Recap's own colours, with the
 * week so far and a button into the full Recap. On Sunday and Monday only,
 * for a listener with some history (recapCardDue); the menu has it any day.
 *
 * Its palette is picked by the week, so it holds still while you use the app
 * and is different next week. A week with nothing played yet invites a first
 * song rather than showing zeros.
 */
import React, {useMemo} from 'react';
import Svg, {Circle, Path} from 'react-native-svg';
import {BRIGHT_PALS, CARD_PALS, burst} from '../brandArt';
import {CARD_ART, FeatureCard} from './FeatureCard';
import {dayKey, summarizeWeek, useStatsState} from '../stats';

const DAY_MS = 24 * 60 * 60 * 1000;
const BURST = burst(CARD_ART / 2, CARD_ART / 2, 88, 54, 12);

/** Monday of the week `at` falls in, as a day key. Exported for the test. */
export function weekOf(at: number): string {
  const back = (new Date(at).getDay() + 6) % 7;
  return dayKey(at - back * DAY_MS);
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function RecapTeaser({
  onOpen,
  width,
}: {
  onOpen: () => void;
  width?: number;
}) {
  const stats = useStatsState();
  const week = weekOf(Date.now());
  const sum = useMemo(() => summarizeWeek(stats.log, Date.now()), [stats]);
  // Stable for the week: the Monday's date picks the palette.
  // Never the colour of another Home card (see brandArt CARD_PALS).
  const taken = Object.values(CARD_PALS).map(x => x.bg);
  const pals = BRIGHT_PALS.filter(x => !taken.includes(x.bg));
  const pal = pals[Number(week.replace(/-/g, '')) % pals.length];
  const empty = sum.songs === 0;
  return (
    <FeatureCard
      pal={pal}
      kicker="Your week in music"
      title={
        empty
          ? 'Play a song to start it'
          : `${sum.songs} ${sum.songs === 1 ? 'song' : 'songs'}, ${duration(
              sum.minutes,
            )}`
      }
      action="Open Recap"
      onPress={onOpen}
      width={width}
      art={
        <Svg width={CARD_ART} height={CARD_ART}>
          <Path d={BURST} fill={pal.a} />
          <Circle cx={CARD_ART / 2} cy={CARD_ART / 2} r={34} fill={pal.b} />
        </Svg>
      }
    />
  );
}
