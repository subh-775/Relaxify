/**
 * The two-level "+" that replaced the ⊕ and the ♥ in both players.
 *
 * Not liked  → tap → liked, and the glyph fills. The common action, one press,
 *              no sheet in the way.
 * Liked      → tap → the "Saved in" sheet, for everything that is not Liked
 *              Songs.
 * Either     → long press → straight to the sheet, so wanting a playlist does
 *              not mean liking the song first and then unliking it.
 *
 * The glyph MUST change on the first press, or the second press reads as the
 * first one having failed — which is the way a control with two levels usually
 * goes wrong.
 *
 * One component rather than the same logic in the player and the mini player,
 * because two copies of a two-level control is two chances for them to end up
 * disagreeing about what the second press does.
 */
import React, {useCallback} from 'react';
import {StyleProp, TouchableOpacity, ViewStyle} from 'react-native';
import {CircleCheck, CirclePlus} from '../icons';
import {C} from '../theme';
import type {Track} from '../backend';
import {toggleLike, useLike} from '../store';
import {getBestArtworkUrl} from '../tracks';
import {toast} from '../toast';

export function AddButton({
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
    if (!liked) {
      toggle();
      toast('Added to Liked Songs', 'info', {
        art: getBestArtworkUrl(track),
        action: {label: 'Undo', onPress: () => toggleLike(track)},
      });
      return;
    }
    onOpenSheet(track);
  }, [track, liked, toggle, onOpenSheet]);

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
      accessibilityLabel={
        liked ? 'Saved. Open the list of playlists' : 'Add to Liked Songs'
      }
      style={style}>
      <SavedGlyph on={liked} size={size} />
    </TouchableOpacity>
  );
}

/**
 * "In" or "not in", as one mark — and the ONLY definition of it.
 *
 * There were two: this one, and a private copy inside AddToPlaylistSheet whose
 * comment claimed it was "the same mark the + button wears". It was, until the
 * + changed and the sheet did not, which is how a filled green disc with a
 * true-black ring ended up sitting next to the outline version in the same
 * screen. Two copies of one glyph is two chances for them to disagree, and the
 * disagreement is invisible until someone screenshots both at once.
 *
 * Not in: a grey ring with a +. In: a solid coral disc with the tick CUT OUT
 * of it, so whatever is behind — black, a tinted player — shows through the
 * tick. That is what retired the old dark ring: a filled disc used to need a
 * dark stroke to keep a drawn-on tick legible, and the stroke ringed the disc
 * too. A hole needs no second colour.
 */
export function SavedGlyph({on, size = 25}: {on: boolean; size?: number}) {
  return on ? (
    <CircleCheck size={size} color={C.accent} solid />
  ) : (
    <CirclePlus size={size} color={C.sub} />
  );
}
