# RisuAI Decoder

Browser tools for extracting RisuAI modules (`.risum`) and PNG character card data.

## Quick Start

With Python 3 installed, run this command from the project folder:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

### Decode a Module

1. Open http://localhost:8000/decoder/ in your browser.
2. Wait until the page shows **Drop file here**.
3. Drag and drop a `.risum` file, or click the drop area to select one.
4. A ZIP file downloads automatically, containing `module.json` and any extracted files in `assets/`.

An internet connection is required to load the module decoder's external JavaScript libraries.

### Decode a PNG Character Card

1. Open http://localhost:8000/plugin/png-decoder-fixed.html.
2. Select one or more PNG character cards.
3. Click **Decode Character Cards** to view the embedded data and available downloads.

Press `Ctrl+C` in the terminal to stop the server.
