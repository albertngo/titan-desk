# Site sheets (printable masters)

The paper sheets a PM fills on site. Print them on Letter, one sided. Planned: the PM photographs them into
CompanyCam (tagged **Site Sheet**) and the quote app reads them from there; today only the stair sheet is read,
from photos uploaded in the Site sheet tab.

| File | What it is |
|---|---|
| `flooring-site-sheet-v1.pdf` | **Flooring Site Sheet v1** (2026-11-03). One page. It goes on top of the Stair Site Sheet. |
| `flooring-site-sheet-v1.html` | Its source. Shown on screen, it has the review notes beside the page: how each box becomes the quote. Printed, it's the page alone. |
| `render.js` | Makes the flooring PDF from its source. |
| `stair-site-sheet-v6.pdf` | **Stair Site Sheet v6** (since 2026-10-31). Two pages, printed as a pair. Today staff upload a photo of each page in the quote's **Site sheet** tab, as its footer says. |

The stair sheet's source isn't in this repo, only the PDF. Its on-screen copy is
`src/components/SiteSheetPaper.tsx`, and that copy has to change whenever the printed sheet does (see the
Site sheet rule in `../CLAUDE.md`). Replace the PDF here when the printed sheet changes, with the version in
its file name.

**The app doesn't read the flooring sheet yet.** v1 is for the team to start using. Reading it from
CompanyCam into Rooms and the flooring lines, and the car check with **Send measured**, are the next build.
Decision and rules: titan-vault `05_decisions/2026-11-03-measured-quote-from-site-sheets.md`.

To change the flooring sheet, edit the HTML, then rebuild the PDF (Playwright is preinstalled in cloud sessions):

```bash
node quote/sheets/render.js quote/sheets/flooring-site-sheet-v1.html quote/sheets/flooring-site-sheet-v1.pdf /tmp/sheet-check.png
```

`render.js` prints the page's content height against the page height (`[1056, 1056]` means it fits) and
saves a screenshot to check. Bump the version in the sheet's header and footer and in the file names when a
change reaches the printed copies.
