/**
 * The heart, in both players and on every song row.
 *
 * Tap  → liked, or not liked any more: one press, no sheet, and the heart
 *        fills or empties at once.
 * Hold → the "Saved in" sheet, as a shortcut. Playlists are otherwise in the
 *        ⋯ menu.
 *
 * It replaced a two-level "+": the first press liked the song, the second
 * opened the playlists. Nobody could tell which press they were on, and
 * unliking took a trip through a sheet.
 *
 * One component rather than the same logic in the player, the mini player and
 * the rows, so they cannot end up disagreeing about what a press does.
 */
import React, {useCallback} from 'react';
import {StyleProp, TouchableOpacity, ViewStyle} from 'react-native';
import {Heart} from '../icons';
import {C} from '../theme';
import type {Track} from '../backend';
import {useLike} from '../store';
import {getBestArtworkUrl} from '../tracks';
import {toast} from '../toast';

export function LikeButton({
  track,
  onOpenSheet,
  size = 25,
  style,
  hitSlop = 8,
}: {
  track: Track | null;
  onOpenSheet: (t: Track) => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  hitSlop?: number;
}) {
  const {liked, toggle} = useLike(track);

  const onPress = useCallback(() => {
    if (!track) {
      return;
    }
    toggle();
    toast(liked ? 'Removed from Liked Songs' : 'Added to Liked Songs', 'info', {
      art: getBestArtworkUrl(track),
    });
  }, [track, liked, toggle]);

  const onLongPress = useCallback(() => {
    if (track) {
      onOpenSheet(track);
    }
  }, [track, onOpenSheet]);

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityState={{selected: liked}}
      accessibilityLabel={
        liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'
      }
      style={style}>
      <Heart
        size={size * 0.9}
        color={liked ? C.accent : C.sub}
        fill={liked ? C.accent : 'none'}
        strokeWidth={liked ? 2 : 1.8}
      />
    </TouchableOpacity>
  );
}
