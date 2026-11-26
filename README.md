# Phronesis: UGC NET PYQ practice site

*Phronesis* (Greek φρόνησις) is Aristotle's word for practical wisdom: knowing how to act well in a real situation. The site's tagline is "Practical wisdom for UGC NET".

A static site for practising Paper 1 and Philosophy previous-year questions (114 papers, 6,910 questions). It has no build step and no server code.

| File | What | How to put it on GitHub |
|---|---|---|
| `index.html` | Page shell | Paste |
| `style.css` | Styles (light and dark) | Paste |
| `app.js` | The app | Paste |
| `quiz-data.json` | All papers and explanations, with the 21 images embedded (8.2 MB) | Upload: **Add file → Upload files** on the repo page, then drag it in |
| `README.md` | This file | Optional |

## Look and theme
The design uses the Plus Jakarta Sans font from Google Fonts. If the font can't load, the page falls back to the system font without delay. Light and dark themes follow the device setting until you use the moon/sun button in the top bar; that choice is then remembered in this browser. On phones, the main sections are in a tab bar at the bottom.

## Full exams
The Papers page defaults to **Full exam**: the Paper 1 and Philosophy papers of the same sitting attempted together (150 questions, 3 hours for NTA papers). There are 33 of these, built in `app.js` from the single papers, so `quiz-data.json` needs no change. Single papers are still available under "Paper 1 only" and "Philosophy only".

## Scores and cut-offs
After a full exam, the result shows Paper 1, Paper 2 and the total separately, and compares the total with that cycle's official Philosophy JRF and Assistant Professor cut-offs for the category you pick (remembered in this browser). The paper page shows the same cut-offs before you start. For CBSE papers (2012–2017) Paper 1 had 60 questions of which the first 50 answered are marked, as in the real exam. Cut-off data lives in `data/cutoffs.json`.

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
Attempts, bookmarks and exam history are saved in the browser's localStorage. Each submitted exam keeps your full answer sheet (for the 60 most recent exams), so you can reopen it from **Answers** in any attempts table and see what you picked, the key, and the explanation for every question. Exams taken before this feature keep only their score. Use **Stats → Export progress / Import progress** to move them between devices.
