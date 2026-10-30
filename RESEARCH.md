# How SmartTube skips sponsored segments

This note is from reading SmartTube and its MediaServiceCore dependency on 30 Oct 2026. It describes behaviour in my own words. No SmartTube source is copied into this repository. SmartTube is GPL-3.0; Skipsmith is a separate MIT implementation of the same idea for desktop Chrome and Brave.

Sources, both `master`:

- SmartTube `4b3f333e540a` (28 Oct 2026). The player behaviour lives in `SponsorBlockController`, the settings model in `SponsorBlockData`, and the settings UI in `SponsorBlockSettingsPresenter`.
- MediaServiceCore `40fec843eb24` (28 Oct 2026). The HTTP client is `SponsorBlockService` / `SponsorBlockApi` / `SponsorBlockApiHelper`. Category names live on the `SponsorSegment` interface.

SmartTube is an Android TV YouTube client. It does not ship a browser extension, and it does not let you submit new SponsorBlock segments (a TV remote is a bad tool for marking in and out points).

## Categories

SmartTube knows these SponsorBlock categories:

| API id | What it means in the settings | Seek-bar colour |
| --- | --- | --- |
| `sponsor` | Sponsor | green `#00FF00` |
| `intro` | Intermission / intro animation | cyan `#00FFFF` |
| `outro` | Endcards / credits | blue `#0000FF` |
| `interaction` | Interaction reminder (subscribe) | magenta `#FF00FF` |
| `selfpromo` | Unpaid / self promotion | yellow `#FFFF00` |
| `music_offtopic` | Non-music section of a clip | orange `#FF9900` |
| `preview` | Preview or recap | light blue `#2793E6` |
| `poi_highlight` | Interesting point (bookmark) | pink `#FF1684` |
| `filler` | Off-topic filler | violet `#7300FF` |

`filler` is called out in the settings code as extreme, and it is the only category whose default action is "do nothing". Every other category defaults to "skip with a notification" the first time it is seen.

Not in that list, but part of SponsorBlock today: `hook` (hook / greetings) and `exclusive_access` (a whole-video paid-promotion label). A SmartTube feature request (`#5023`, still open as of this reading) asks for `hook`. Skipsmith includes both.

Each category also has its own seek-bar colour toggle. Colour markers default to every known category. A category can be drawn on the bar even when its action is "do nothing", and it is requested from the server if either the action or the colour is enabled.

## What each category can do

Per category, the viewer picks one action:

1. **Do nothing.** The segment is not skipped. It can still be drawn if its colour marker is on.
2. **Only skip.** The playhead jumps with no message. Also used when the player is in picture-in-picture, the screen is off, or the player is an embed.
3. **Skip with a notification.** A toast: skipping that category. This is the default for every category except filler.
4. **Show a confirmation dialog.** Playback is not jumped until the viewer accepts. The dialog closes on its own after roughly the remaining length of the segment, adjusted by playback speed. If another dialog or the suggestions row is open, SmartTube does not stack a second one.

There is no separate "draw on the seek bar only" action. That combination is "do nothing" plus the colour marker. There is no Unskip button. The toast is informational.

Other SponsorBlock switches:

- **Don't skip segments again.** Off by default. After a segment matches, it is removed from the active list so a later pass will not take it.
- **Ignore short segments.** Default 5 seconds. If the time left to skip is shorter than that, the skip is dropped. (There is also a 10 second floor when a specific texture-view seek bug is enabled.)
- **Exclude this channel.** A channel id blocklist. While the current channel is excluded, SponsorBlock is turned off for that video and the player button shows off.
- **Paid content notification.** Off by default. If YouTube's own metadata says the video includes paid promotion, SmartTube shows that text.
- **Alternative server.** Off by default. Switches the host from `sponsor.ajay.app` to `api.sponsor.ajay.app` when the primary host misbehaves.
- A master SponsorBlock enable switch. It defaults on except on very old Android.

The player also has a SponsorBlock button. A short press, while the playhead is inside a segment, jumps to the end of the matched run (full-segment match, not just the start window). If the playhead is not inside a segment, the same button toggles SponsorBlock for the video and clears a channel exclusion. A long press opens the category settings.

## How segments are fetched

SmartTube's client calls:

`GET https://sponsor.ajay.app/api/skipSegments?videoID=<id>&categories=["sponsor",...]`

with the alternate host `https://api.sponsor.ajay.app` when that setting is on. The category filter is a JSON array. The observed client sends the **raw video id**. It does not hash it.

That is worth saying plainly, because SmartTube's README describes SponsorBlock as a "privacy preserving query system". That sentence is SponsorBlock's own description of the public API. The Android client I read does not use the privacy-preserving form. It tells the server exactly which video is playing. I did not find a `viewedVideoSponsorTime` ping in this client, so a skip itself is not reported back. The video id still leaves the device on every fetch.

The privacy-preserving lookup, which SponsorBlock documents and which Skipsmith uses, is different:

`GET https://sponsor.ajay.app/api/skipSegments/<prefix>?categories=[...]&actionTypes=[...]`

`<prefix>` is the first 4 hex characters of `SHA-256(videoId)`. Four characters is what SponsorBlock recommends. The server returns every video whose hash starts with that prefix (often dozens), and the client keeps the entry whose `videoID` is the one being watched. A published `hash` field is documented; the live response I checked on 30 Oct 2026 often omitted it and only sent `videoID` plus `segments`. The request itself never contains the video id.

A 404 means the prefix has no segments. Each segment has `category`, `actionType` (`skip`, `mute`, `full`, `poi`, and sometimes `chapter`), `segment: [startSeconds, endSeconds]`, `UUID`, `videoDuration`, `locked`, and `votes`. SmartTube keeps start, end, category, and action type, and converts times to milliseconds. The server already applies its vote threshold, so the client does not re-score votes.

The controller caches the in-flight request for the current video id and polls the player once a second. Live videos are not queried. A new video clears the coloured ranges immediately.

## How a skip is decided

Once a second, if the video is actually playing:

- A segment matches when the playhead is in a window at its **start**: from `start` to `min(start + 2 seconds × playback speed, end)`. Landing in the middle does not auto-skip. That window is how a normal play-in is detected, and it is also why a casual seek into the middle is left alone.
- The manual player button uses a full match instead: anywhere from start to end.
- Skip-like actions (plain skip, or skip with toast) chain forward. A following segment joins the run when a point about 3 seconds past the previous end still sits in that next segment's start window. The jump target is the end of the last segment in the run. Dialog actions are not chained; the first match wins.
- The same end position is not applied twice (`last` skip target). Combined with "only while playing", this is the loop guard. Seeking back onto a segment that was just skipped does not jump again, because the target end has not changed. Seeking back into the **middle** also fails the start-window test, so it would not jump even without that guard.
- If "don't skip segments again" is on, the matched segments are dropped from the active list entirely.
- Very short remaining distances are ignored (the 5 second default above).
- The seek is clamped to the real media duration, because a submission can run past the end of the file.
- Segments are drawn as start/end ratios of the duration, one range per coloured category.

Mute segments are stored, but the skip controller does not mute. It seeks those segments the same way it seeks `skip` segments. `poi_highlight` is a bookmark: it is drawn, and with the default "skip with notification" action it can also be jumped if the playhead sits in its start window. Filler defaults to do nothing so it is only drawn.

Live streams are not segmented. An excluded channel tears the watcher down once the channel id is known.

## Other SmartTube behaviour that maps to a desktop browser

**Playback speed memory.** This is independent of SponsorBlock and defaults to **per channel**. On a speed change, the player stores the rate against the channel id. On the next video it restores the channel rate, or a per-video saved rate, or a global rate, depending on which of those three modes is on. Global "remember for every video" and per-video memory default off. Music videos, and the moment a live stream ends, are forced back to 1×. A desktop extension can do the per-channel half of this. It has to be careful: YouTube itself writes `playbackRate` while a video is loading, so an extension that saves too early will memorize `1`.

**Paid-promotion notice.** YouTube already prints this on the watch page. SmartTube repeats the metadata string in a toast, behind a setting that defaults off. Easy to add, also easy to make noisy. Skipsmith leaves the YouTube notice alone.

**Seek-bar colour.** High value and cheap. Skipsmith draws one colour per category for every mode except Off.

**Channel exclude.** High value. Skipsmith puts it in the popup.

**Alternative host.** Worth a silent retry if the primary host returns a network error or a 5xx. Not a setting.

**DeArrow** (replacement titles and thumbnails) is a separate SmartTube feature with its own server. It is out of scope for a segment skipper.

**What I did not port on purpose**

- Submitting or voting on segments.
- The 5 second minimum length. It hides a lot of real sponsor reads. Skipsmith will skip a segment as short as about 0.2 seconds.
- Picture-in-picture and screen-off special cases.
- A confirmation dialog. "Show skip button" is the manual mode that fits a mouse.

## What Skipsmith does differently

The behaviour above is the spec I wrote down before coding. The extension does not share code with SmartTube. A few choices are deliberate departures:

- Requests use the 4-character SHA-256 prefix. The video id is matched locally. Nothing is sent when a segment is skipped. Time saved stays in `chrome.storage`.
- Seeking **forward** into an auto-skip segment skips it, including a landing in the middle. SmartTube would wait until the playhead is in the opening ~2 seconds. Seeking **backward** into a segment latches it so the jump cannot repeat until the playhead has been back before the start.
- The toast has Unskip, which seeks back and latches the same way.
- `mute` segments mute the element when the category is on auto. They are not seeked.
- `poi_highlight` is only a seek-bar mark. It is never auto-skipped.
- Defaults are narrower than SmartTube's: sponsor, self promotion, and interaction reminders auto-skip; intro, outro, preview, and hook show a button; filler, non-music sections, and exclusive-access stay off; highlights are seek-bar only.
