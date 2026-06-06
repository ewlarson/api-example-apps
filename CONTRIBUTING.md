# Contributing an App

Thanks for helping grow `api-example-apps`. This repo is intentionally low ceremony: no package install, no build step, and each app is a small static page.

## What to Build

A good app in this repo:

- Shows one clear BTAA Geospatial API idea.
- Lives in one folder under `apps/`.
- Uses plain HTML, CSS, and JavaScript.
- Works in a browser from a local static server.
- Handles loading, empty, and API error states.
- Links users to the live Geoportal record, search, or API JSON when useful.

## App Folder Shape

```text
apps/your-app-slug/
  index.html
  styles.css
  app.js
```

Keep extra data files, images, or CSVs inside the same app folder.

## Fastest Start

Copy the starter app:

```bash
cp -R templates/example-app apps/your-app-slug
```

Then edit these files:

- `apps/your-app-slug/index.html` for the app name, visible labels, controls, and result placeholders.
- `apps/your-app-slug/styles.css` for layout and visual polish.
- `apps/your-app-slug/app.js` for the API query, data cleanup, and rendering.
- `index.html` for the gallery card on the repo home page.
- `README.md` for the short app description and API query notes.

## No Terminal Path

You can do the same work in GitHub's browser editor:

1. Fork the repo.
2. Open your fork on GitHub and press `.` to open the browser editor.
3. Copy `templates/example-app/` into a new folder under `apps/`.
4. Rename the copied folder with a short lowercase slug, like `subject-picker`.
5. Edit the text, controls, and JavaScript for your idea.
6. Commit your changes on a new branch and open a pull request.

## Naming

Use a short lowercase folder name with hyphens:

```text
apps/nearby-maps/
apps/provider-bubbles/
apps/your-app-slug/
```

The app title can be friendlier than the folder name.

## Local Preview

From the repo root, run:

```bash
/usr/bin/python3 -m http.server 4173
```

Open:

```text
http://localhost:4173
```

Then open your app from the gallery or visit:

```text
http://localhost:4173/apps/your-app-slug/
```

## Gallery Card

Add a card to the root `index.html` inside the `app-grid` section:

```html
<a class="app-card" href="apps/your-app-slug/">
  <span class="app-icon" aria-hidden="true">
    <i data-lucide="sparkles"></i>
  </span>
  <span class="app-kicker">API pattern</span>
  <h2>Your App Name</h2>
  <p>One sentence about what the app helps people do.</p>
  <span class="app-action">
    Open app
    <i data-lucide="arrow-right" aria-hidden="true"></i>
  </span>
</a>
```

Lucide icon names are listed at <https://lucide.dev/icons/>.

## Pull Request Checklist

Before opening a PR, check:

- The app loads from `http://localhost:4173/apps/your-app-slug/`.
- The root gallery card opens the app.
- Buttons and form inputs have useful labels.
- Status text uses `aria-live` when it changes after an API request.
- The app looks good on phone and desktop widths.
- API failures show a helpful message instead of a broken page.
- No API keys, tokens, private URLs, or personal data are committed.
- `README.md` includes the new app and the API endpoint it uses.

## Style Notes

Apps can have their own personality, but they should feel related to the rest of the repo. Reuse the shared ideas you see in the existing demos: sticky blue header, compact controls, visible API status, clear result cards, and direct links to records or API requests.
