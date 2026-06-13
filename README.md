# Alt Tab

A Chrome extension that switches between recent tabs and lets you manage tiny
shortcut URL redirects.

## Files

- `manifest.json`: Extension metadata and shortcut wiring.
- `background.js`: Tracks tab activation history and redirects configured
  shortcut URLs.
- `popup.html`, `popup.css`, `popup.js`: The action popup for adding and
  removing shortcut URL mappings.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this repository folder.

## Set the shortcut

1. Open `chrome://extensions/shortcuts`.
2. Find `Alt Tab`.
3. Set a shortcut for `Switch to the other recent tab`.

Clicking the extension icon opens the popup menu. The recent-tab behavior is
still available through the keyboard shortcut. Single-tab `about:blank` windows
are ignored so floating picture-in-picture surfaces are not treated as recent
tabs.

## Add shortcut URL mappings

1. Click the `Alt Tab` extension icon.
2. Enter a shortcut such as `c`. The popup automatically treats it as
   `http://c/`.
3. Enter the full destination URL, such as
   `https://calendar.google.com/calendar/u/0/r`.
4. Click `Save Mapping`.

When Chrome navigates to an exact matching shortcut URL, the extension rewrites
that top-level navigation to the saved destination URL. Mappings can be deleted
from the same popup. URL mappings use Chrome sync storage, so they follow the
signed-in Chrome profile across computers when extension sync is enabled.

## Package for Chrome Web Store

```sh
rm -rf dist/chrome-store
mkdir -p dist/chrome-store
rsync -av --exclude='.git' --exclude='dist' ./ dist/chrome-store/
node -e 'const fs=require("fs"); const m=require("./manifest.json"); delete m.key; fs.writeFileSync("dist/chrome-store/manifest.json", JSON.stringify(m,null,2)+"\n")'
cd dist/chrome-store
zip -r ../alt-tab-1.1.0.zip .
```

## License

MIT. See `LICENSE`.
