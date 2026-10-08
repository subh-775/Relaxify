/**
 * The Relaxify mark: the Coral Ribbon note.
 *
 * One image (src/assets/logo.png, transparent), made from the same source as
 * the launcher, themed and status-bar icons (res/drawable-*), the RC build's
 * icon and the docs' logo.png; change one, change all.
 */
import React from 'react';
import {Image} from 'react-native';

const MARK = require('../assets/logo.png');

/** The mark. `color` draws it flat in that colour (the Recap's cards). */
export function LogoMark({size, color}: {size: number; color?: string}) {
  return (
    <Image
      source={MARK}
      style={{width: size, height: size, tintColor: color}}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
