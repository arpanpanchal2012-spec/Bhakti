# DMHT Bhakti Studio

A show organizer, presenter/projector interface, anchor script, and online participant buzzer. It is a Python web service with HTML/CSS/JavaScript; no separate packages are required.

## Deploy on Render

1. Unzip the downloaded file. Upload the **contents** of `show-studio-render` to the root of your GitHub repository, replacing the previous files. Check that `index.html`, `app.js`, `integration.js`, `enhancements.js`, `styles.css`, `theme.css`, `render.yaml`, and the `buzzer` folder are all present.
2. In your existing Render web service, select **Manual Deploy → Deploy latest commit** (or wait for automatic deploy). If creating a new service, choose **Web Service**, runtime **Python**, with:
   - Build: `python -m compileall -q buzzer`
   - Start: `python -u buzzer/server.py`
   - Root directory: blank if the above files are at repository root.
3. Open the main Render URL. Refresh both host and projector pages after a deploy; cached pages from earlier versions can cause mismatches.

## Event workflow

- **Program:** create or edit songs, audio, quiz, slides and other segments. Attach files on the device that will host the show. Song video can loop; the host player supplies audio. Song intros can be disabled or shown for up to 30 seconds. Style 9 shows the next lyric. Style 11 supports a custom glow color. Audio tracks do not show lyrics.
- **Quiz:** enter two to four options and the correct option; attach an optional image. In Presenter, use Next Lyric / Reveal (or Space) to reveal options one by one and then the answer. Down arrows for navigation are not used; use Next Item or Page Down.
- **Presenter:** open Projector Screen, then start each item’s attached media from the host player. The projector displays muted video; share your computer audio in Zoom, and share the projector window. Host and projector must run in the same browser profile on the same device. The host and projector video are separate browser players, synchronized approximately; device/browser restrictions and latency can affect synchronization.
- **Buzzer:** in Presenter click Create room and Copy participant link. Send the participant link in Zoom chat. Participants enter a name and click Join round. Open/Lock/Reset from Presenter; choose Show/hide participants on projector. Check the optional buzzer box when editing a segment to include buzzer instructions; use Show / Hide on Projector to control visibility. Rank is based on server receipt; network and Zoom delays affect fairness. Scoring buttons add or subtract points locally; the host must avoid awarding the same answer twice.
- **Anchor:** generate an editable script from event details and the sequence. Host notes are private; the anchor tab and teleprompter are not part of the projector.
- **Pre-show check:** looks for missing titles, local attachments, quiz answers and song lyrics. It does not verify playback codecs, Zoom audio or connectivity; rehearse those manually.
- **Backup:** regular Export is JSON with show metadata only. `Backup with media` generates a JSON file with media encoded in it; it can be very large and use substantial browser memory. Restore via `Restore backup`. Make a separate copy of original videos as well. Browser storage quota and operating-system policies can remove local data.

## Persistence and safety

Buzzer rooms are stored in SQLite. `BUZZER_DB_PATH` sets the database file path; default is `buzzer/rooms.sqlite3`. A normal local process restart retains the database file. **Render's default filesystem is ephemeral**, so a redeploy or replacement can erase rooms. To retain rooms on Render, provision a persistent disk if your plan supports it and set `BUZZER_DB_PATH` to a file on the mounted disk. Use one server instance; SQLite files are not a shared multi-instance database. Back up important data independently.

Show data, scores and attached media remain in the host browser, not the server. A host room token controls the buzzer and is held in the host tab's session storage; anyone with that token can control the room. Participant names are visible to anyone with the room link. There is no account login, encryption-at-rest, rate limiting, verified identity, or participant-disconnect tracking. This prototype is for trusted events and requires real rehearsal, not high-stakes competitions.

## Run locally

Run `python buzzer/server.py` from this folder (or `python3`), then open `http://localhost:8080/`. Localhost cannot be accessed by remote Zoom participants; deploy online or use a properly configured public server.

## Windows/Chrome: save and reopen a show folder

On your deployed HTTPS site in desktop Chrome, use **Program → Save Show Folder** and select an empty, dedicated folder. The app writes `show.json` and copies media into a `media` subfolder, one file at a time. Keep the tab open until it says the save is complete. Each save creates new media copies; older copies remain in the folder, so check free disk space. Copy the entire show folder to an external drive as a separate backup.

Use **Open Show Folder** and select that folder on this or another computer. **Open Recent Show** remembers the last folder on this browser; Chrome may request access again. Opening replaces the program currently in the browser. If a file is missing, restore it to the media folder first; the app currently reports missing filenames but does not automatically search for moved files. Large media must first be attached to the browser's local storage; browser quota can still prevent adding very large shows. Folder storage is not cloud storage. Test your largest files and restore before relying on this for a show.

## Blank segments and quiz answers

Choose **Blank text** in Segment Type (or the template) and write your text in the segment title field. Blank and Custom segments display only that text, with no type label on the projector.

Quiz options are optional. Enter correct answer text and/or attach a correct answer image and/or audio. They remain hidden until the host reveals the answer. After reveal, the host can play the answer audio from the player in the Attached media section; share computer audio in Zoom. Question images and answer images are separate files. The show-folder format and the JSON media backup include answer media.

Projector connection status is based on same-browser heartbeat, not a guarantee that a TV or Zoom is displaying the right window. The optional countdown is host-controlled and shared to the projector. Use the existing show preflight to check files and answers, but also manually rehearse playback and Zoom audio. The app does not yet have a dedicated isolated rehearsal mode, timed lyrics, automatic duration estimation, or automatic moved-file searching.

## Emoji questions

In Program, choose **Emoji question** under templates. Put the instruction (for example, “Identify the Pad from the emojis”) in Segment Title, and paste the emoji clue into **Emoji clue**. Enter the answer in **Correct answer text**; you may also attach an answer image or audio. Options are not required. Present the question, and click **Reveal Answer** when ready. The clue appears large on the projector. The answer audio, if any, is played manually from the host screen after revealing it.

## Anchor script format

The anchor script can be generated as a welcome, intention, online-format and Zoom instructions, followed by participant introductions and private quiz cues. In the Anchor Script screen, edit the intention, total participant count, program format, quiz flow and post-performance transition before generating. The sequence supplies names, locations, Pad titles and answers. Put special Zoom-operation instructions or links in each item's private notes. The generated text remains editable, and regenerating replaces manual edits. The private synchronized remote anchor screen is described below.

## Remote anchor view

The host and anchor can be in different places. After adding the show and generating an anchor script, the host opens **Presenter → Remote anchor → Create anchor link**, then uses **Copy private link** and sends it directly to the anchor (not in Zoom chat). The anchor opens the link in a separate browser and stays connected to Zoom for the actual video and audio. The private page follows the host's current and next items, script, notes, answers, hints, host message and online buzzer ranking. The host must keep the host tab open and connected. Use **End access** to invalidate the link, or create a new link to replace it. A refresh normally reconnects the same anchor browser tab.

Private links are bearer credentials: anyone with the link can see the private answers and script. Only share with the anchor. A link contains the credential after `#`; the anchor page stores it in its browser session and removes it from the address bar after opening. The server does not serve private state to the public buzzer API. Anchor session state, including script and private notes, is stored unencrypted in the server's SQLite database until access is ended; the host/session credentials are saved in the host browser's session storage. Host private messages and session data are not end-to-end encrypted. Deploy using Render HTTPS, protect database access, and use a trusted group. This is not a full user-account, audit or rate-limited authentication system.

Anchor sync uses periodic polling (about two seconds each way), not instant or frame-perfect real time. The anchor may see stale data if either connection drops; the screen shows a warning. State is lost if Render replaces an ephemeral filesystem unless a persistent disk is configured; only one server instance is supported. Buzzer rooms have the same limitations. Test with the actual host and anchor devices, Zoom screen share and audio before an event. Videos remain local to the host; they are not uploaded or played on the anchor page.

## Anchor welcome and buzzer instructions

The Anchor Script settings include an editable **Welcome: participant buzzer instructions** field. The default explains how guests open the participant link in Zoom chat, enter a name, join and keep the page open. Clear the field to omit these instructions. Generated scripts no longer add automatic Zoom-operator media instructions. Existing private notes remain private cues. After updating the app, regenerate the script to apply the new wording; regeneration replaces existing manual script edits, so export or copy the current script first.

## Question-specific anchor cues

For a quiz item, choose a Question type in Program: simple trivia, emoji, next line, instrumental, or audio. The corresponding anchor cue is generated automatically. Enter an optional custom anchor instruction on the quiz item to replace that question's default cue. Enable the optional buzzer checkbox for individual questions; the opening script then explains how to join the buzzer, and those questions include a short buzzer reminder. Instrumental/audio/next-line audio can be attached to the question and played from the host media player. Older quiz items without a type default to simple trivia, except items with an emoji clue which default to emoji; edit other older quizzes to select the desired type. The old global quiz-flow text is no longer applied to every question. Save any manual anchor script edits before regenerating.

### Participant display control
The projector participant/ranking overlay is hidden by default. Create, open, lock and reset do not show it. Use **Show / Hide on Projector** to show or hide it; changing to another segment hides it again. The host and private anchor can still see the participant information without displaying it to the audience.

## English and Gujarati scripts and remote teleprompter
In Anchor Script, generate and edit the English and Gujarati scripts independently. Gujarati uses Roman Gujarati + English standard prompts, not automatic translation: names, Pad titles, custom greeting, notes, answers, and custom cues remain exactly as entered. Review and edit both scripts before the show. Regenerating a language replaces edits to that language. Settings and scripts are saved with the show. Download Gujarati as UTF-8 TXT.

Create the private anchor link from Presenter and send it directly to the anchor. On that page, choose English or Gujarati and select Open teleprompter. Start or pause scrolling, adjust speed and text size, or scroll manually. Updates arrive while the host tab is open; unchanged text does not reset the scrolling position. Older shows without Gujarati text remain usable. The anchor link contains private answers and cues: never post it publicly.
