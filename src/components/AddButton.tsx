/**
 * The two-level "+" that replaced the ⊕ and the ♥ in both players.
 *
 * Not saved  → tap → liked, and the glyph fills. The common action, one press,
 *              no sheet in the way.
 * Saved      → tap → the "Saved in" sheet, for everything that is not Liked
 *              Songs. Saved is liked OR in any playlist: a song added to a
 *              playlist from the sheet wears the tick too, liked or not.
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
import {AddCircle, SavedCircle} from '../glyphs';
import {C} from '../theme';
import type {Track} from '../backend';
import {useLike} from '../store';
import {useInAnyPlaylist} from '../playlists';
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
  const saved = useInAnyPlaylist(track) || liked;

  const onPress = useCallback(() => {
    if (!track) {
      return;
    }
    if (!saved) {
      toggle();
      toast('Added to Liked Songs', 'info', {art: getBestArtworkUrl(track)});
      return;
    }
    onOpenSheet(track);
  }, [track, saved, toggle, onOpenSheet]);

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
        saved ? 'Saved. Open the list of playlists' : 'Add to Liked Songs'
      }
      style={style}>
      <SavedGlyph on={saved} size={size} />
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
 * Spotify's pair: a thin grey ring with a + while not saved, a solid coral
 * disc with a black tick once it is. The tick is drawn in its own colour (see
 * `ink` in src/glyphPaths.ts), so the disc needs no dark ring to keep it
 * legible on a coloured bar.
 */
export function SavedGlyph({on, size = 25}: {on: boolean; size?: number}) {
  return on ? (
    <SavedCircle size={size} color={C.accent} />
  ) : (
    <AddCircle size={size} color={C.sub} />
  );
}
