# Constellation Lyrics

Your song, drawn as a living constellation: every lyric word lights up as a star in time with the music, and the whole scene pulses to the beat.

- **64 curated designs:** twelve looks for each of five styles (Constellation, Karaoke, Kinetic, Orbit, Wave), plus the selectable Speaker stage style, with search, category filters, illustrated previews, and manual style and colour controls
- **9 colour palettes** (including *Album*, which takes its colours from the cover art, and *Tokyo* with neon crimson & cyan)
- **8 backgrounds:** Stardust, Tokyo Night (Japanese Mt. Fuji, cyber moon & drifting sakura), Northern Lights (dancing Arctic aurora curtains), Nebula, Aurora, Spectrum, Pulse rings, Pure black, and Custom Image / GIF (upload pictures or animated GIFs with cover fit and dimming)
- **Mood presets:** Japanese Phonk (Dela Gothic, Tokyo night, kanji bursts, drift streaks, screen shake, glitch & RGB split distortion), Phonk, Aurora dream, Dreamy, Midnight calm, Electric, Warm sunset, and Minimal
- **Expanded lyric fonts:** Dela Gothic One (Phonk), Zen Tokyo Zoo, DotGothic 16-bit, Syne Wide, Orbitron Sci-Fi, Righteous Neon, Sawarabi Mincho, DM Sans, Manrope, Oswald, Bebas Neue, and Noto Sans JP
- **Interactive:** stars drift away from your cursor, click or tap for a starburst
- **Cursor trails:** choose from over 20 independent effects—including fire, rose petals, lightning, bubbles, leaves, snow, and music notes—or match the selected design or mood. The cursor follows more directly, and trails stay selected when you change designs.
- **Animated controls and lyrics:** buttons respond to hover/press, and lyric words animate with each visual style; tune this with **Word & scene motion**
- **Beat sync:** automatically analyzes MP3s played in the app; Spotify and YouTube can be synced by sharing their tab/system audio. Spotify playback is interpolated between API updates and small timing drift is eased in smoothly to avoid lyric jumps. Enable **Beat zoom + lyric tilt** or **Aggressive lyric zoom + tilt** for smooth lyric movement on each beat.
- **Beat visuals & Phonk effects:**
  - **Edge-to-edge lines locked in one spot:** wave line, signal waveform, spectrum curve, audio waveform, heartbeat line, and scanline all run completely from one end of the screen to the other (0 to width) and stay anchored at your chosen spot (bottom or near-center).
  - **Randomly placed beat effects:** radiant neon beat bursts, glowing Japanese kanji (`鬼`, `殺`, `影`, `魂`, `夜`, `夢`, `侍`, `狂`, `闇`, `龍`, `死`, etc.) and Tokyo drift speed streaks appear dynamically at randomized screen locations.
  - **Screen shake & flashing lights:** high-impact beat screen shake with rotational kick, strobe flicker pulse, black beat flicker, and full-screen flashing lights with perimeter vignette strobe.
  - **Glitch & Distortion:** horizontal slice tearing, digital block glitch, and RGB split (chromatic aberration) on bass drops.
  - **Clean & neat:** removed cluttered beat rain, mirror bars, and impact target rings for a crisp, punchy presentation.
- **Share a design:** the URL stores your look, so "Copy design link" shares it
- **Three music sources:** connect Spotify, play a YouTube video, or keep an MP3 library saved locally in your browser

## Play and save MP3s

Choose **Play your MP3s → Choose MP3 files** on the welcome screen, or open **Customize → Your MP3 library → Add MP3 files**. Select one or more `.mp3` files to save them in this browser and start playing the first one. Use the song list to play it again later or remove it. Saved audio stays in this browser's local IndexedDB storage; it is not uploaded, and clearing browser site data removes it. Playback depends on your browser supporting the MP3 file.

The Customize panel also has mood presets, an animated Aurora background, and pointer effects. Choose butterflies, stardust, comet, hearts, orbiting stars, or a design-matched trail under **Cursor animation**.

## 1. Connect Spotify (optional)

1. Select **Connect Spotify** on the welcome screen.
2. Sign in to Spotify and approve read-only access.
3. Start a song in Spotify on your phone or computer. Keep this page open; it will follow along.

If Spotify setup has not been completed for this copy of the app:

1. Open https://developer.spotify.com/dashboard and create an app (choose **Web API**).
2. Copy the exact address shown under **Connect Spotify** and add it as a **Redirect URI**.
3. Copy the **Client ID** into `config.js` and reload the app.

The Client ID is not a secret. Sign-in uses PKCE, validates the OAuth state, and requests only read-only playback scopes. Access and refresh tokens are kept in the current browser tab's session storage rather than persistent local storage. Disconnect in **Customize → Actions** to clear this tab's tokens; to revoke Spotify's grant as well, remove the app at https://www.spotify.com/account/apps/.

Apps in Spotify's development mode only work for the owner and people you add under *User Management*. Spotify credentials from earlier versions are cleared on startup, so reconnect after updating.

## 2. Play YouTube music (no account sign-in)

Type a song and artist in the YouTube box and select **Find / Play**. Choose a result on YouTube, copy its address, return to this app, paste the address, then select **Find / Play** again. Or paste a YouTube video address immediately to open it here. Press **Play** in the embedded video to start. If the embed is unavailable, blocked, or your browser cannot play it, use the always-visible **Open on YouTube** button below the player or try another result. The app does not sign in to YouTube, request account permissions, or download video/audio. Lyrics are matched against the video title and duration; synced timing is preferred, and plain lyrics use estimated timing when available.

To sync a YouTube beat, press **Sync beat to this music** under the embedded player, choose **This tab** in the browser's share dialog, and enable **Share tab audio**. The browser does not let this app identify tracks playing in other tabs or apps; Spotify metadata requires connecting Spotify, and YouTube metadata must be played through this app.

## 3. Run it

**On your PC:** in this folder run

    py -m http.server 5500 --bind 127.0.0.1

then open http://127.0.0.1:5500/ (use `127.0.0.1`, not `localhost`: Spotify rejects `localhost`).

**On GitHub:** push the folder to a repo, then *Settings → Pages → Deploy from branch → main / root*. Open the Pages URL.

**As a desktop app:** in Chrome or Edge, click the install icon in the address bar. It then opens in its own window and you can leave it fullscreen on a second monitor.

## 4. Beat sync

For an MP3 playing in this app, beat analysis starts automatically in browsers that support media capture and stays local. If it is unavailable, or for Spotify and YouTube, select **Customize → Beat sync → Sync to music** and, in the browser's share dialog, choose the music tab and enable **Share tab audio**. For the Spotify desktop app, choose your screen and enable **Share system audio**. Audio capture is processed locally and is not sent to the app's services. The detector responds to both bass hits and attacks elsewhere in the mix; adjust **Beat sensitivity · bass + full mix** if it misses beats or reacts too much.

## Shortcuts

`1`-`5` style · `P` colour · `B` background · `R` surprise me · `C` customize · `F` fullscreen · `[` `]` lyric timing · click for a starburst

## Notes

- Lyrics come from [LRCLIB](https://lrclib.net), a free lyrics database. Synced timing is used when available; otherwise, plain lyrics are shown with estimated timing. Songs not in the database show "No lyrics found".
- Synced lyrics are timed per line, so word timing within a line is estimated. Use **Lyric timing** (or `[` / `]`) to nudge it.
- Word highlights use estimated syllable counts to better follow dense, fast lyrics. Exact rap phrasing still requires word-timestamped lyrics, which may not be available.
- Try the **Try demo** button to see all the styles without logging in.

## Project layout

| File | What it does |
| --- | --- |
| `index.html`, `style.css` | Source selection, embedded YouTube player, login screen and Customize panel |
| `app.js` | Spotify login (PKCE), YouTube playback, now-playing sync, lyrics lookup and settings |
| `render.js` | The five lyric styles, backgrounds, particles |
| `beat.js` | Beat detection from system audio / microphone |
| `themes.js` | Colour palettes and shared helpers |
| `config.js` | **Your Spotify Client ID goes here** |

## Credits and license

Lyrics data from [LRCLIB](https://lrclib.net). Track info comes from the Spotify Web API or YouTube's embedded player. This project is not affiliated with Spotify or YouTube.
Lyrics belong to their respective rights holders; this app only displays them for personal listening.

Released under the [MIT License](LICENSE). Replace the copyright line in `LICENSE` with your own name before publishing.
