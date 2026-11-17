# Show Studio + Live Zoom Buzzer

A browser-based show manager and a separate shared online buzzer. Show Studio manages the playlist and anchor script; the live buzzer lets Zoom guests buzz from their own devices. No database or paid API is required for this prototype.

## Deploy on Render using GitHub

1. Create a GitHub repository. Upload **the contents of this folder** to its root. Ensure `render.yaml`, `index.html`, `app.js`, `styles.css`, and the `buzzer` folder are visible at the top level. Do not upload only the ZIP file.
2. On Render, choose **New → Blueprint**, connect your GitHub account, and select the repository. Render reads `render.yaml`. Follow the prompts to create the web service and choose an available plan.
3. Wait for the build and deployment to finish. Open the public service URL Render provides. This opens **Show Studio**.
4. Use the **online buzzer room** link at the top of Show Studio to open the online buzzer.

Alternatively, create a Render **Web Service** from your repository and set:
- Language/runtime: Python
- Build command: `python -m compileall -q buzzer`
- Start command: `python -u buzzer/server.py`

Render provides the `PORT` environment variable; the server listens on `0.0.0.0`.

## Use it with Zoom

1. Visit the deployment's main URL, select **online buzzer room**, and click **Create host room**.
2. Copy the **participant link** displayed on the host page and paste it into Zoom chat. Keep the host URL private; it contains the key that controls the room.
3. Participants open the link on their computer or phone, enter their names, and remain in Zoom to hear the instrumental.
4. Share the music in Zoom using Zoom's computer-audio sharing. In the buzzer host page, press **Open buzzers**. Ranking is based on server receipt order. Press **Lock** to stop new buzzes and **Reset round** before the next question.

The buzzer is a separate browser page alongside Zoom; it is **not a Zoom Marketplace app**. The built-in Show Studio attendee view uses local browser messaging and is only for rehearsal; use the online room for remote guests. Show Studio does not currently synchronize its own playlist, scores or round controls with the online buzzer; operate both pages side by side.

## Run locally

Install Python 3.9 or newer. In the folder containing this README, run:

```bash
python buzzer/server.py
```

If needed use `python3` instead. Visit `http://localhost:8080/` for Show Studio and `http://localhost:8080/buzzer/` for the buzzer. `localhost` cannot be used by remote Zoom participants; deploy publicly first.

## Important limitations

- **Temporary rooms:** Rooms and buzzes are held in server memory. A restart, redeploy, idle sleep, or service replacement removes them. Create a new room after a restart. Run only one server instance: multiple instances do not share rooms. Render plans and idle/sleep behavior can change; check Render's current plan details.
- **Local show data:** Show Studio uses browser storage on the device and browser where it is entered. It is not a multi-user cloud editor. Export and keep backups. Media files may be large; test persistence, browser quota and export/relink behavior before a show.
- **Fairness:** The server ranks requests by receipt, not by when people heard the audio or pressed the button. Internet latency, Zoom audio latency, and polling delays matter. Displayed times are from the host opening the round, not reliable contestant reaction times.
- **Privacy & security:** Anyone with a participant link can join and see names; anyone with a host URL can control the room. Use first names or nicknames. There are no accounts, moderation, persistent database, rate limits, automatic room expiry, or protection against determined cheating. One buzz per browser identifier is a convenience, not identity verification. This prototype is for trusted groups, not high-stakes or large public events.
- **Browser limitations:** Use a modern browser with JavaScript and local storage enabled. Keep pages open and test a complete round before going live.
