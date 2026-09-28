/**
 * Keeps the home-screen widget (NowPlayingWidget.kt) in step with playback:
 * the song, its cover, playing or paused, and the song's colour, the same
 * darkened wash the mini player wears.
 *
 * Called from player.ts on every track change and play/pause; identical
 * pushes are dropped, so calling it often costs nothing.
 */
import {NativeModules} from 'react-native';
import type {Track} from './backend';
import {getBestArtworkUrl} from './tracks';
import {getArtworkColor, surfaceTint} from './artworkColor';

type WidgetNative = {
  update?: (
    title: string,
    artist: string,
    artwork: string | null,
    playing: boolean,
    tint: string | null,
  ) => void;
};

const native = (NativeModules.Widget ?? {}) as WidgetNative;

let last = '';
let lastTrack: Track | null = null;
let lastPlaying = false;

export function pushWidget(track: Track | null, playing: boolean): void {
  if (typeof native.update !== 'function' || !track?.title) {
    return;
  }
  lastTrack = track;
  lastPlaying = playing;
  const art = getBestArtworkUrl(track) || null;
  const send = (tint: string | null) => {
    const key = `${track.title}|${track.artist}|${art}|${playing}|${tint}`;
    if (key === last) {
      return;
    }
    last = key;
    try {
      native.update?.(track.title, track.artist || '', art, playing, tint);
    } catch {
      // A missing or older native side: the widget just stays as it was.
    }
  };
  if (!art) {
    send(null);
    return;
  }
  getArtworkColor(art)
    .then(c => {
      // Only if nothing newer has been pushed while the colour was worked out.
      if (lastTrack === track && lastPlaying === playing) {
        send(c ? surfaceTint(c, 0.16) : null);
      }
    })
    .catch(() => send(null));
}

/** Play state changed with no new track: repaint with the last song. */
export function pushWidgetPlaying(playing: boolean): void {
  if (lastTrack) {
    pushWidget(lastTrack, playing);
  }
}
