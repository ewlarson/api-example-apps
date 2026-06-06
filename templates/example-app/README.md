# Example App Template

This is a copyable starter for a small BTAA Geospatial API demo.

## Use It

```bash
cp -R templates/example-app apps/your-app-slug
```

Then change:

- `index.html`: app title, header mark, labels, controls, and result template.
- `styles.css`: layout, colors, spacing, and responsive behavior.
- `app.js`: endpoint URL, query parameters, record cleanup, and rendering.

The starter already includes:

- A live `/api/v1/search` request.
- Loading, error, empty, and token-exhaustion states.
- Abort handling for quick repeated searches.
- Result cards with Geoportal record and API JSON links.
- Lucide icons and accessible form labels.

After copying, add your app to the root gallery in `index.html` and describe it in `README.md`.
