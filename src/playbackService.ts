/**
 * Runs outside the UI, in the playback foreground service.
 *
 * This is where lock-screen buttons, the notification transport, and Bluetooth /
 * earbud (AVRCP) commands land. Handling them here — rather than in a component
 * — is what makes them work while the app is backgrounded or the screen is off.
 *
 * Deliberately device-agnostic: we respond to the standard remote events every
 * headset and car stereo emits, with no per-device mapping.
 */
import TrackPlayer, {Event} from 'react-native-track-player';
import {setPausedByDuck, wasPausedByDuck} from './duckState';
import {
  isRunning,
  pause,
  playWithFade,
  seekTo,
  skipNext,
  skipPrevious,
  stop,
  topUpFromRadio,
} from './player';

/**
 * Did WE pause because we lost audio focus, or did the user?
 *
 * Without this distinction the duck handler resumed on ANY focus regain — so a
 * notification chime arriving after you had deliberately pressed pause started
 * the music back up on its own. Only playback that ducking interrupted may be
 * resumed by ducking ending; anything the user paused stays paused.
 *
 * This mirrors what the reference build got for free: there, Chromium owned
 * audio focus and only ever resumed the media element it had paused itself.
 */
module.exports = async function playbackService() {
  // An explicit transport command settles who owns the pause: whatever the user
  // (or their headset) just asked for outranks anything ducking remembered.
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    setPausedByDuck(false);
    // Faded, like every other route into playback. A headset click resuming a
    // track that is already seeked is the harshest start of the lot: the output
    // opens on a waveform mid-cycle, with a Bluetooth codec still negotiating.
    playWithFade().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    setPausedByDuck(false);
    pause().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    setPausedByDuck(false);
    stop().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, ({position}) =>
    seekTo(position),
  );

  /**
   * The queue ran dry — last line of defence for autoplay.
   *
   * The top-up normally happens on PlaybackActiveTrackChanged, a few songs
   * ahead. If that missed (a slow radio response, a queue emptied by a manual
   * skip), this catches it: it runs HERE, in the foreground service, so it
   * still fires with the app backgrounded and the screen off — which is the
   * exact situation where the UI's JS timer is frozen and playback used to just
   * stop until you pressed next.
   */
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    try {
      await topUpFromRadio();
      const queue = await TrackPlayer.getQueue();
      const index = await TrackPlayer.getActiveTrackIndex();
      // Only if the top-up actually appended something past where we stopped.
      if (queue.length && index != null && index < queue.length - 1) {
        await TrackPlayer.skipToNext();
        await playWithFade();
      }
    } catch {
      /* nothing to continue with — leave playback stopped */
    }
  });

  // The app's own Next and Previous, so a headset gets the same behaviour: an
  // overlap is cut, a skip resumes a paused song, Next at the end of the queue
  // finds similar songs, and Previous restarts the song before it jumps back.
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    skipNext().catch(() => {});
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    skipPrevious().catch(() => {});
  });

  // Audio focus changed — a call, another player, a notification chime.
  TrackPlayer.addEventListener(
    Event.RemoteDuck,
    async ({paused, permanent}) => {
      if (permanent) {
        // Focus is gone for good (another app took over). Never auto-resume.
        setPausedByDuck(false);
        await pause();
        return;
      }
      if (paused) {
        // Transient loss. Only remember it as ours if we were actually playing —
        // otherwise a duck arriving while already paused would later "resume"
        // music the user had stopped.
        const {state} = await TrackPlayer.getPlaybackState();
        if (isRunning(state)) {
          setPausedByDuck(true);
          await pause();
        }
        return;
      }
      // Focus regained: resume ONLY what ducking paused.
      if (wasPausedByDuck()) {
        setPausedByDuck(false);
        await playWithFade();
      }
    },
  );
};
