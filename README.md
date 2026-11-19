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
- **Buzzer:** in Presenter click Create room and Copy participant link. Send the participant link in Zoom chat. Participants enter a name and click Join round. Open/Lock/Reset from Presenter; choose Show/hide participants on projector. Check the optional buzzer box when editing any segment to show it automatically. Rank is based on server receipt; network and Zoom delays affect fairness. Scoring buttons add or subtract points locally; the host must avoid awarding the same answer twice.
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
