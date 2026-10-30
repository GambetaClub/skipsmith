# Skipsmith

Skipsmith is a Manifest V3 extension for Chrome and Brave. On a YouTube watch page it skips sponsored segments, draws them on the progress bar, and keeps a private count of time saved.

Segment times come from [SponsorBlock](https://sponsor.ajay.app). That data is licensed **CC BY-NC-SA 4.0**. Skipsmith is not affiliated with SponsorBlock or with [SmartTube](https://github.com/yuliskov/SmartTube). The behaviour is reimplemented from scratch; see [RESEARCH.md](RESEARCH.md) for what SmartTube actually does. This project is MIT. SmartTube is GPL-3.0, and none of its source is included here.

## Install

Chrome and Brave load the unpacked `dist/` folder the same way.

1. `npm install`
2. `npm run build` — writes `dist/` and `skipsmith.zip`
3. Open `chrome://extensions` or `brave://extensions`
4. Turn on **Developer mode**
5. **Load unpacked** and choose the `dist` folder

Reload the YouTube tab after installing or updating the extension. The content script does not attach to a tab that was already open.

The default shortcut is **Alt+Shift+S**. Change it at `chrome://extensions/shortcuts` or `brave://extensions/shortcuts`.

## What it does

- Runs on desktop watch pages, Shorts, and embeds (`youtube.com`, `m.youtube.com`, and `youtube-nocookie.com`), including after YouTube's in-app navigation.
- Fetches segments with SponsorBlock's privacy lookup: the first 4 hex characters of SHA-256 of the video id. The video id is not in the request. Results are cached per video.
- Per category: **Auto skip**, **Skip button**, **Seek bar only**, or **Off**. Sponsor, unpaid/self promotion, and interaction reminders start on auto skip. Intros, endcards, previews, and hooks start as a button. Filler, non-music sections, and whole-video "exclusive access" labels start off. Highlights are a mark on the bar and are never skipped.
- Coloured ranges on the YouTube progress bar.
- A small toast when a skip happens, with **Unskip**. Seeking backward into a segment that was just skipped does not skip it again.
- A toolbar popup with an on/off switch, the current video's segments, and total time saved (`chrome.storage` on this browser only). It says when SponsorBlock returned no segments, when the request failed, and when the content script is not running in the tab.
- An optional debug log in settings, kept in this browser, for the player, the SponsorBlock response, skips, and seeks back into a segment.
- Optional per-channel playback speed memory, off until you enable it in settings.
- A per-channel "don't skip this channel" control in the popup.
- Mute-type segments are muted when that category is set to auto skip, instead of being jumped.
- No account, no analytics, and no "I viewed this segment" ping back to SponsorBlock.

Permissions are `storage`, `activeTab` (so the popup can tell a YouTube tab from any other tab), and the SponsorBlock hosts. YouTube access for the player is only the content script.

## Develop

```bash
npm install
npm test       # segment decisions, hash lookup, settings
npm run lint
npm run build
npm run test:e2e   # loads dist/ in Chromium and opens the popup and options
```

`npm run check` runs lint, unit tests, the build, and the Playwright smoke test. The smoke test launches headed Chromium, because the headless shell cannot load extensions. Point `DISPLAY` at a real display, or run it under `xvfb-run`.

## Limits

- If nobody has submitted a segment, there is nothing to skip.
- Live streams are left alone. A video is live only when the player is marked live. A missing or infinite media duration is not treated as live, because that is how the desktop player behaves before Media Source commits a length.
- Coloured ranges sit on the progress bar before the playhead reaches them. Clicking or dragging into a segment that was skipped, or pressing Unskip, plays it. It is not skipped again until the playhead has been back before that segment's start.
- YouTube ads are not blocked. Skipping pauses while an ad is playing so a sponsor time is not applied to the ad.
- The progress bar, skip button, and toast depend on YouTube's player markup. Seeking uses the `<video>` element and survives more of those changes. Shorts use a different scrubber; the skip still runs when the video element is found, and the bar is drawn when a known scrubber is found.
- A forward seek into an auto-skip segment skips it, including a landing in the middle. A backward seek into a segment latches it until the playhead moves back before the start.
- Very short remains (under about 0.2s) are not jumped, and a failed seek is retried once so a near-miss cannot loop.
- Speed memory can lose a race with YouTube resetting `playbackRate` during load. It is off by default for that reason.
- Incognito only works if you allow the extension there.
