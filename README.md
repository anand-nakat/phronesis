# UGC NET PYQ practice site

A static site for practising Paper 1 and Philosophy previous-year questions (114 papers, 6,910 questions). It has no build step and no server code.

| File | What | How to put it on GitHub |
|---|---|---|
| `index.html` | Page shell | Paste |
| `style.css` | Styles (light and dark) | Paste |
| `app.js` | The app | Paste |
| `quiz-data.json` | All papers and explanations, with the 21 images embedded (8.2 MB) | Upload: **Add file → Upload files** on the repo page, then drag it in |
| `README.md` | This file | Optional |

## Full exams
The Papers page defaults to **Full exam**: the Paper 1 and Philosophy papers of the same sitting attempted together (150 questions, 3 hours for NTA papers). There are 33 of these, built in `app.js` from the single papers, so `quiz-data.json` needs no change. Single papers are still available under "Paper 1 only" and "Philosophy only".

## Deploy on GitHub Pages
1. Create a repository and add the four files above to its root.
2. Go to **Settings → Pages → Build and deployment**. Choose *Deploy from a branch*, then `main` and `/ (root)`, and save.
3. The site appears at `https://<username>.github.io/<repo>/` within a minute or two.

## Updating the questions
After `data/` changes, rebuild the bundle and upload `quiz-data.json` again:

    python3 tools/build_site_data.py

## Explanations
Questions from 2017 onward have plain-English explanations, written in ASD-STE100 style. They appear under the answer after you choose an option, and in exam review. For questions with no key, the app shows a suggested answer, labelled "not official", and marks that option with a dashed border. The sources are in `data/explanations/`; see the README there. They are merged into `quiz-data.json` by the same build command.

## Testing locally
Opening `index.html` straight from disk won't load the data, because browsers block it. Run a local server instead:

    python3 -m http.server 8791 --bind 127.0.0.1 --directory site

Then open http://127.0.0.1:8791/. (Port 8765 is used by the Trading project's server.)

## Where progress is stored
Attempts, bookmarks and exam history are saved in the browser's localStorage. Use **Stats → Export progress / Import progress** to move them between devices.
