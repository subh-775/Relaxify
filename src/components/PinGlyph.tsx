/**
 * A pushpin leaning right, head up: Spotify's pin, in whatever colour the
 * caller gives it (coral on a Library row).
 *
 * Drawn already leaning (src/glyphPaths.ts, `pin`), so no caller rotates it.
 * Used in every place pinning appears, so the badge on a row and the "Pin"
 * action in the menu are visibly the same idea.
 */
import React from 'react';
import {Glyph} from '../glyphs';

export function PinGlyph({size = 13, color}: {size?: number; color: string}) {
  return <Glyph name="pin" size={size} color={color} />;
}
