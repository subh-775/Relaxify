/**
 * A pushpin, seen face-on.
 *
 * Lucide's `Pin` was drawn at 45°, and at the 12px the library rows use it —
 * filled, in green — the diagonal body read as a paper plane rather than a
 * pin. Drawn upright, the head-shaft-point silhouette survives being that
 * small, which is the whole job of an icon at badge size. The drawing is
 * `Pin` in glyphs.ts, with the rest of the set.
 *
 * Used in both places pinning appears, so the badge on a row and the "Pin"
 * action in the menu are visibly the same idea.
 */
import React from 'react';
import {Pin} from '../icons';

export function PinGlyph({size = 12, color}: {size?: number; color: string}) {
  return <Pin size={size} color={color} />;
}
