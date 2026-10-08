<div align="center">

<img src="docs/public/logo.png" alt="" width="300" height="300">

<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/wordmark-dark.svg">
    <img src="docs/public/wordmark-light.svg" alt="Relaxify" width="300">
  </picture>
</h1>

A free music player for Android. Search, stream and download from JioSaavn,
SoundCloud and YouTube in one place, and listen together with friends.

[![Release](https://img.shields.io/github/v/release/subh-775/Relaxify?label=Release&labelColor=111111&color=FF5A6E)](https://github.com/subh-775/Relaxify/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/subh-775/Relaxify/build-android.yml?event=push&label=Build&labelColor=111111&color=FF5A6E)](https://github.com/subh-775/Relaxify/actions/workflows/build-android.yml)
[![App Docs](https://img.shields.io/badge/App%20Docs-Read-FF5A6E?labelColor=111111&color=FF5A6E)](https://subh-775.github.io/Relaxify/)
[![Downloads](https://img.shields.io/github/downloads/subh-775/Relaxify/total?label=Downloads&labelColor=111111&color=FF5A6E)](https://github.com/subh-775/Relaxify/releases)
[![Licence](https://img.shields.io/github/license/subh-775/Relaxify?label=Licence&labelColor=111111&color=FF5A6E)](LICENSE)

</div>

---

## About

Relaxify is a music player for everyday listening. One search covers JioSaavn,
SoundCloud and YouTube, and the results arrive as a single list.

It is the React Native successor to
[Fix-Spotify](https://github.com/AshirwadRai/Fix-Spotify), which ran its
interface inside a WebView. Relaxify keeps Fix-Spotify's search and
source-matching engine and replaces everything around it: a native interface,
a native playback engine and native audio effects. The result is smoother to
use and much lighter on the phone's processor and battery.

## Features

- **One search, three catalogues.** A song available on more than one source is
  listed once. If its stream fails, playback switches to another source instead
  of stopping.
- **A full player** built for one hand: swipe the cover to change song,
  double-tap to seek, pull up for the queue. The player takes on the colour of
  the song's cover.
- **Queue and Autoplay.** Reorder what plays next, and keep listening with
  similar songs when the queue runs out.
- **Downloads** as ordinary tagged audio files that play offline and in any
  other app.
- **Your library:** liked songs, playlists, saved albums, followed artists and
  listening history.
- **Import from Spotify or YouTube.** A public Spotify playlist or album link,
  or a YouTube / YouTube Music playlist link, becomes a playlist you own, saved
  by itself, with a way to stop part-way and keep what was found.
- **Shared playlists.** Send a friend a six-character code; they follow your
  playlist and your changes reach them.
- **Wrong song? Pick another copy.** Swap a bad match for the right version in
  the player, and it stays your pick everywhere.
- **Jam.** Listen to the same song at the same moment as friends, each on their
  own phone, with a six-character code. Everyone can play, pause, skip and add
  to a shared queue.
- **Recap.** Your week or all-time listening told as a story of cards, with a
  weekly notification on Sunday evening.
- **Sound:** an eight-band equalizer with presets that each pair of headphones
  remembers, volume normalization, crossfade, and playback speed.
- **Lyrics**, synced where the source provides timing; tap a line to jump there.
- **Home in your languages**, a home-screen widget, a data saver for mobile
  data, and Auto quality that steps down on a weak signal instead of stopping.
- **In-app updates** that install over the current version and keep your
  library.

## Install

Download `Relaxify.apk` from the
[latest release](https://github.com/subh-775/Relaxify/releases/latest) and open
it on your phone. Android 8.0 or newer is required.

To update, use **Settings → Check for updates** in the app. Do not uninstall
first: uninstalling deletes your playlists, likes and history.

The [documentation](https://subh-775.github.io/Relaxify/) walks through every
feature in six short pages.

## How it works

| Part | What it does |
| --- | --- |
| **Interface** | React Native (TypeScript), in `App.tsx` and `src/`. |
| **Playback** | ExoPlayer through react-native-track-player, running in a foreground service so music keeps playing with the screen off. It streams each song straight from the source's servers; downloads play from their files. |
| **Audio effects** | A Kotlin module (`AudioModule.kt`) for the equalizer, loudness and crossfade. |
| **Engine** | A Python server embedded with Chaquopy that searches the sources, finds and checks each song's stream link (the player is redirected to it, so no audio passes through the engine) and handles downloads. The interface talks to it over `127.0.0.1`, with a per-launch token. |
| **Jam and sharing** | A Firebase Realtime Database record per Jam holds the song, position and shared queue, and one per shared playlist its songs (rules in `firebase/`: only the phone that shared a playlist can change it). No audio passes through it; each phone streams for itself. |
| **Usage statistics** | Firebase Analytics and Crashlytics, tied to an anonymous ID. The docs' Help page lists exactly what is sent. |

## Building from source

Requirements: Node.js 18 or newer, JDK 17, the Android SDK (API 34) with NDK
26.1, and Python 3.11 on the build machine (Chaquopy uses it to package the
engine).

```bash
git clone https://github.com/subh-775/Relaxify.git
cd Relaxify
npm install
npx react-native run-android
```

`npm install` also applies the library patches in `patches/`.

For day-to-day work without reinstalling an APK for every change, see
[DEVELOPING.md](DEVELOPING.md).

## Contributing

Contributions are welcome. Branch from `mobile` and open your pull request
against `mobile`. [CONTRIBUTING.md](CONTRIBUTING.md) explains where the code
lives, the checks to run, and the few rules that keep existing installs
updating safely.

## Repository layout

| Path | Contents |
| --- | --- |
| `App.tsx`, `src/` | The app. `src/screens/` and `src/components/` are the interface; the modules directly under `src/` handle playback, storage, the engine client and the library. |
| `android/` | The Android project, the Kotlin native modules, and the embedded Python engine in `android/app/src/main/python/`. |
| `__tests__/` | Jest tests for logic where a mistake would otherwise go unnoticed. |
| `patches/` | Changes to third-party libraries, applied by `npm install`. |
| `docs/` | The documentation site (Vite, React and MDX), published to GitHub Pages from `main`. |
| `firebase/` | The Jam database's security rules. |

## Credits

- **[Subhansh Malviya](https://github.com/subh-775)** builds and maintains
  Relaxify.
- **[Ashirwad Rai](https://github.com/AshirwadRai)** created Fix-Spotify and
  designed the search, source-matching and API logic that Relaxify's engine is
  built on.

Relaxify also depends on open-source projects including NewPipeExtractor,
yt-dlp, react-native-track-player and Chaquopy. See [NOTICE](NOTICE) for the
full list and their licences.

## Licence

Relaxify is free software, licensed under the
[GNU General Public License v3.0](LICENSE). Copyright and third-party notices
are in [NOTICE](NOTICE), with the licence's additional terms: keep the credits,
and a modified version needs its own name, logo and app ID — "Relaxify" and its
logo are not licensed for other builds.

## Disclaimer

Relaxify is intended for learning and personal listening. It does not host,
store or distribute any copyrighted content.

You are responsible for making sure your use complies with the law and with the
terms of service of the platforms involved. The authors accept no liability for
misuse of this software.

Support the artists you listen to: buy their music and use official streaming
services.
