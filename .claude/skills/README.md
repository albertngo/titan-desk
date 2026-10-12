# Project skills (`.claude/skills/`)

Claude Code loads every `*/SKILL.md` here as a project skill. These are vendored copies of
two open-source design libraries, added so UI work in this repo starts from real design
rules instead of defaults. Both are MIT licensed; the licence texts sit beside them.

## From [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)

Pinned at upstream commit `d237dd399d57524945c0c81327da5da19f7a468d` (2026-10-11).
Folder names are the upstream install names (the `name:` in each file's front matter).

| Skill | Use it when |
|---|---|
| `design-taste-frontend` | The default. New pages, sections, landing-style screens. Reads the brief, infers a direction, pre-flight checks the result. |
| `redesign-existing-projects` | Improving a screen that already exists: audit first, then fix layout, spacing, hierarchy. |
| `high-end-visual-design` | A calm, polished, "expensive" look: whitespace, soft contrast, spring motion. |
| `minimalist-ui` | Editorial product UI (Notion / Linear feel), restrained palette, crisp structure. |
| `industrial-brutalist-ui` | Swiss type, hard contrast, experimental layout. Rarely right for Titan; here for range. |
| `full-output-enforcement` | When the model ships half-finished code with placeholder comments. |

Not vendored on purpose: `taste-skill-v1` (legacy), `gpt-tasteskill` and
`image-to-code-skill` (written for GPT / Codex), `stitch-skill` (Google Stitch only), and
the three image-generation-only skills (`imagegen-frontend-web`, `imagegen-frontend-mobile`,
`brandkit`), which produce pictures, not code.

## From [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md)

Pinned at upstream commit `13be5c05c63be24b57581162364167028020f043`.

`design-md-references/` wraps the 74 `DESIGN.md` files (one real website's design system
each) in a skill with an index and usage rules. Read that `SKILL.md` for how to pick and
apply a reference. Short version: borrow the spacing, type and component system; never the
other company's brand.

## Updating

Clone the upstream repo, copy the files over the matching folders here, and update the
pinned commit above. For taste-skill, copy `skills/<folder>/SKILL.md` to
`<install-name>/SKILL.md`. For awesome-design-md, copy `design-md/<site>/DESIGN.md` to
`design-md-references/references/<site>/DESIGN.md` and regenerate the index table in
`design-md-references/SKILL.md` from the upstream README's "Collection" section.
