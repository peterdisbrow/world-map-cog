# World Map COG

This project powers the Church of God interactive world map / prayer table experience.

## Modes

- Hosted mode: the current Vercel deployment with Blob + Cloudinary storage.
- Local kiosk mode: a read-only Node mirror for the Windows wall machine.

## Local Kiosk Mode

The local server keeps the table running even if internet access is unreliable. It:

- serves the map app from local files
- syncs content from the hosted Vercel app
- caches the latest synced location data in `local-data/locations.json`
- caches remote images in `local-data/mirrored-assets/`
- falls back to the last synced snapshot if the internet is down

### Start It

```bash
node server.js
```

Then open:

- `http://127.0.0.1:3030/`

Helper scripts:

- macOS/Linux server: `./start-local-server.sh`
- Windows server: `start-local-server.bat`
- macOS/Linux kiosk browser: `./launch-kiosk-local.sh`
- Windows kiosk browser: `launch-kiosk-local.bat`
- Windows one-click launcher: `run-local-kiosk.bat`

## Windows Wall PC Setup

Recommended setup for the UM790 Pro or similar Windows kiosk machine:

1. Install Node.js LTS.
2. Double-click `run-local-kiosk.bat` to start the local server and open the kiosk.
3. If you want to run only the server, use `start-local-server.bat`.
4. If you want the wall to boot straight into the experience, place a shortcut to `run-local-kiosk.bat` in the Windows Startup folder after auto-login is configured.

Notes:

- `run-local-kiosk.bat` waits for `http://127.0.0.1:3030/api/health` before opening the kiosk.
- It logs local server startup output to `local-data/server.log`.
- It will use Chrome if installed, and fall back to Edge if Chrome is not available.
- The local server syncs from `https://world-map-cog.vercel.app` by default. Override this with `REMOTE_BASE_URL` if needed.
- Sync status is available at `http://127.0.0.1:3030/api/sync-status`.

## Notes

- The local kiosk is read-only. Make all content changes in the hosted Vercel app.
- Local `/admin` and `/submit` routes intentionally point users back to the hosted content management pages.
- The local cache syncs on startup and then again on an interval.
- If the network is unavailable, the kiosk keeps showing the latest successful synced snapshot.
- App code updates are still separate from content sync. If the UI code changes, update the project files on the wall PC and restart the launcher.
- Generated local data is ignored by git via `local-data/`.

## Portable Bundle (Recommended) — Zero-Install Windows Setup

Download `world-map-kiosk-portable.zip` from the [latest release](https://github.com/peterdisbrow/world-map-cog/releases/latest), unzip anywhere, and double-click **`Start Prayer Table.vbs`**.

The bundle includes Node.js v22 and all dependencies — no installation required.

The launcher:
- Clears the Chrome cache on every launch (prevents stale assets)
- Starts the local server
- Opens Chrome (or Edge) fullscreen in kiosk mode
- Auto-restarts Chrome if it ever closes

### SETUP-KIOSK.bat — One-Time Kiosk Hardening

**Run once as Administrator** after first setup to harden Windows for unattended 24/7 operation.

Right-click `SETUP-KIOSK.bat` → **Run as administrator**

| Step | What it does |
|------|-------------|
| **1. Nightly reboot** | Creates a scheduled task *"Prayer Table Nightly Reboot"* that reboots at **3:00 AM daily** (`schtasks /create`). Keeps the system fresh and clears memory leaks. |
| **2. Power plan** | Sets High Performance scheme; `powercfg` sets sleep and display timeouts to **Never** on both AC and DC power. |
| **3. Disable Windows Update** | Sets active hours to 0–23 (registry) so WU can never auto-reboot. Pauses updates 35 days via Group Policy. Stops and **disables** the `wuauserv` service entirely. |
| **4. Auto-hide taskbar** | Writes `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\StuckRects3` to enable taskbar auto-hide, then restarts Explorer to apply immediately. |

Reboot the PC after running to ensure all settings take effect cleanly.

### SETUP-AUTOSTART.bat — Launch on Login

Double-click to add a startup shortcut so the kiosk launches automatically on Windows login (no admin needed).

## Release Package

For a downloadable deployment bundle without exposing the repo publicly, build a release zip:

```bash
bash ./scripts/create-release-package.sh
```

That creates a clean package in `release/` with:

- no git metadata
- no `.env.local`
- no `local-data`
- no `node_modules`
- Windows/macOS startup scripts included

The release bundle only needs Node.js installed on the target machine.

## Hosted Admin Security

The hosted Vercel admin and write APIs are protected by HTTP Basic Auth in `middleware.js`.

Set these Vercel environment variables before relying on the hosted admin:

- `BASIC_AUTH_USERNAME`
- `BASIC_AUTH_PASSWORD`

Protected hosted routes:

- `/admin`
- `/submit`
- `POST /api/locations`
- `PUT/PATCH/DELETE /api/locations/:id`
- `POST /api/upload/:id`
- `POST /api/upload-thumbnail/:id`

Public hosted routes that stay open:

- `/`
- `GET /api/locations`
