# My Roster

A mobile-first PWA that turns a hospital ward duty-roster PDF into your own monthly shift calendar.
It is a static site with no backend. The PDF is read in your browser, and everything is stored on your device in localStorage.

## Features

- **First upload:** pick your name from the staff list once. The app saves your name and staff ID.
- **Later uploads:** the app finds you by staff ID (falling back to your name) and saves your shifts under the right month.
- **Multiple PDFs at once:** the 1–15 and 16–end halves merge into one month. Re-uploading the same dates overwrites them.
- **Calendar:** Sunday-start month grid with colour-coded shift tiles, the note under each code, and today highlighted. Tap a day for details. Underneath are the legend and monthly counts. Navigate with the prev/next buttons, by swiping, or with the arrow keys.
- **Save as PNG:** a 1080-px-wide image sized for WhatsApp. On a phone it opens the share sheet.
- **Add to calendar:** exports a `.ics` file with one all-day event per working day. Off days (RD, NO, AL, PH…) are skipped unless you turn on the toggle in Settings.
- **Settings:** Change person, theme (Auto, Light or Dark), Clear all data.
- **Works offline:** the service worker caches the app shell, and pdf.js is bundled in `vendor/`, not loaded from a CDN. The app can be installed on Android and iOS.

## How parsing works

`js/parser.js` reads text items with their x/y position from pdf.js (`pdfjs-dist@3.11.174`). It never relies on the order of the text.

- **Date columns:** header cells like `1-Nov` give the column centres. For each person, the parser uses the nearest header row above them.
- **Row anchors:** staff IDs (`K?S` + 5–6 digits, e.g. `S001702`, `KS00330`). Row bounds are midway between neighbouring IDs, capped at 0.6× the median row spacing at section edges.
- **Shift code and note:** text above the ID's centre line is the shift code, and text below is the note (e.g. `7-9`, `PRECEP`).
- **Name:** text right of the ID and left of the POSITION column.
- **Month and year:** taken from the date headers plus the title (e.g. `NOVEMBER 2026`).

## Tests

```bash
npm install
# Put the sample rosters in test/fixtures/ (they're gitignored, see below)
npm test
```

The test checks Nur Najihah's 1–30 Nov codes and notes. It also runs any spot-checks listed in `test/spotcheck.json`.

> **Privacy:** real roster PDFs contain colleagues' names, staff IDs and schedules, and GitHub Pages repos are usually public.
> So `test/fixtures/*.pdf` and `test/spotcheck.json` are gitignored. When the fixtures are missing, CI skips the parser test.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Push to `main`.
2. In the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests, then publishes the app files.
   The site is at `https://<user>.github.io/<repo>/`.
4. On your phone, open the URL and install it:
   - Android Chrome: **⋮ → Add to Home screen / Install app**
   - iOS Safari: **Share → Add to Home Screen**

After changing app files, bump `VERSION` in `sw.js` and `APP_VERSION` in `js/app.js`. App code is served network-first, so installed copies update on the next open.
