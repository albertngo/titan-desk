# Site sheets (printable masters)

The paper sheets a PM fills on site. Print them on Letter, one sided. The PM photographs them into CompanyCam
(tagged **Site Sheet**), and the quote's **Site sheet** tab reads them from there (From CompanyCam: tick the pages,
then Read as flooring sheet or Read as stair sheet, since 2026-11-03). Uploading photos in the tab still works for
the stair sheet.

| File | What it is |
|---|---|
| `flooring-site-sheet-v1.pdf` | **Flooring Site Sheet v1** (2026-11-03). One page. It goes on top of the Stair Site Sheet. |
| `flooring-site-sheet-v1.html` | Its source. Shown on screen, it has the review notes beside the page: how each box becomes the quote. Printed, it's the page alone. |
| `render.js` | Makes the flooring PDF from its source. |
| `stair-site-sheet-v7.pdf` | **Stair Site Sheet v7** (since 2026-11-07). Two pages, printed as a pair. Staff photograph each page into CompanyCam or upload it in the quote's **Site sheet** tab, as its footer says. |
| `stair-site-sheet-v7.html` | Its source (new with v7; v6 existed as a PDF only). Rebuild with `render.js`, as below. |
| `stair-site-sheet-v6.pdf` | **Stair Site Sheet v6** (2026-10-31 to 2026-11-06). Kept for sheets already printed; photos of it still read. |

Since v7 the stair sheet's source is here (`stair-site-sheet-v7.html`). Its on-screen copy is
`src/components/SiteSheetPaper.tsx`, and that copy has to change whenever the printed sheet does (see the
Site sheet rule in `../CLAUDE.md`). Replace the PDF here when the printed sheet changes, with the version in
its file name.

**The flooring sheet is read into a check view** (since 2026-11-03), and from there into the Rooms tab and priced
flooring options in the editor. Its reading instructions are `src/lib/floorsheet/prompt.ts` and its shape
`src/lib/floorsheet/sheet.ts`: change them with the sheet. The car check with **Send measured** is not built.
Decision and rules: titan-vault `05_decisions/2026-11-03-measured-quote-from-site-sheets.md`.

To change the flooring sheet, edit the HTML, then rebuild the PDF (Playwright is preinstalled in cloud sessions):

```bash
node quote/sheets/render.js quote/sheets/flooring-site-sheet-v1.html quote/sheets/flooring-site-sheet-v1.pdf /tmp/sheet-check.png
```

The stair sheet the same way (two pages; the screenshot is page 1):

```bash
node quote/sheets/render.js quote/sheets/stair-site-sheet-v7.html quote/sheets/stair-site-sheet-v7.pdf /tmp/stair-check.png
```

`render.js` prints the page's content height against the page height (`[1056, 1056]` means it fits) and
saves a screenshot to check. Bump the version in the sheet's header and footer and in the file names when a
change reaches the printed copies.
