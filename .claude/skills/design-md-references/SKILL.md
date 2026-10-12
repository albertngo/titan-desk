---
name: design-md-references
description: Library of 74 DESIGN.md files reverse-engineered from real product websites (Linear, Stripe, Vercel, Apple, Notion, Airbnb, Wise, and more). Use when designing or redesigning a page, screen, or component and you want a concrete, proven design system to borrow structure from - spacing scale, type scale, surface and border rules, component anatomy, motion. Pick one to three references that match the brief, read them, then build in Titan's own brand.
---

# DESIGN.md references

Each folder under `references/` holds one `DESIGN.md`: a plain-text design system extracted
from a real website, in the Google Stitch DESIGN.md format (YAML front matter with colour,
typography, spacing and radius tokens, followed by prose rules for layout, components,
motion and the "do / don't" list). They come from
[VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT).

## How to use them

1. **Read the brief first.** Decide the feel you are after (editorial, dense dashboard,
   warm consumer, luxury, terminal-dark). Then pick one to three references from the index
   below whose "Look" column matches. Do not read more than three; they are long.
2. **Read the whole `DESIGN.md`** of each pick: `references/<folder>/DESIGN.md`.
3. **Borrow the system, not the identity.** Take the spacing scale, type scale and
   hierarchy, surface and hairline rules, card and button anatomy, section rhythm, and
   motion rules. Never lift another company's brand colours, fonts, logo treatment, or
   copy. Titan Flooring has its own brand, and that always wins:
   - titan-website: brand assets and fonts live in `public/brand/` (wordmark, Cysan and
     PT Serif, the 2024 brand guide). Content and NAP come from `lib/site.ts`.
   - titan-desk: the staff desk (`web/`) and the quoting app (`quote/`) share the desk's
     light look. Keep each app's existing tokens in its `globals.css`.
4. **State your picks** in one line when you start ("Borrowing Linear's spacing and card
   rules, Wise's type scale") so the next person can see the reference.
5. Pair this with the `design-taste-frontend` skill (new pages) or
   `redesign-existing-projects` (existing screens) for the actual build rules.

## Index

### AI & LLM Platforms

| Folder | Site | Look |
|---|---|---|
| `claude` | Claude | Anthropic's AI assistant. Warm terracotta accent, clean editorial layout |
| `cohere` | Cohere | Enterprise AI platform. Vibrant gradients, data-rich dashboard aesthetic |
| `elevenlabs` | ElevenLabs | AI voice platform. Dark cinematic UI, audio-waveform aesthetics |
| `minimax` | Minimax | AI model provider. Bold dark interface with neon accents |
| `mistral.ai` | Mistral AI | Open-weight LLM provider. French-engineered minimalism, purple-toned |
| `ollama` | Ollama | Run LLMs locally. Terminal-first, monochrome simplicity |
| `opencode.ai` | OpenCode AI | AI coding platform. Developer-centric dark theme |
| `replicate` | Replicate | Run ML models via API. Clean white canvas, code-forward |
| `runwayml` | Runway | AI creative-tools platform with an editorial film-festival aesthetic — cinematic dark heroes, paper-white reading bands, single proprietary sans, and pure black pill CTAs. |
| `together.ai` | Together AI | Open-source AI infrastructure. Technical, blueprint-style design |
| `voltagent` | VoltAgent | AI agent framework. Void-black canvas, emerald accent, terminal-native |
| `x.ai` | xAI | Elon Musk's AI lab. Stark monochrome, futuristic minimalism |

### Developer Tools & IDEs

| Folder | Site | Look |
|---|---|---|
| `cursor` | Cursor | AI-first code editor. Sleek dark interface, gradient accents |
| `expo` | Expo | React Native platform. Dark theme, tight letter-spacing, code-centric |
| `lovable` | Lovable | AI full-stack builder. Playful gradients, friendly dev aesthetic |
| `raycast` | Raycast | Productivity launcher. Sleek dark chrome, vibrant gradient accents |
| `superhuman` | Superhuman | Fast email client. Premium dark UI, keyboard-first, purple glow |
| `vercel` | Vercel | Frontend deployment platform. Black and white precision, Geist font |
| `warp` | Warp | Modern terminal. Dark IDE-like interface, block-based command UI |

### Backend, Database & DevOps

| Folder | Site | Look |
|---|---|---|
| `clickhouse` | ClickHouse | Fast analytics database. Yellow-accented, technical documentation style |
| `composio` | Composio | Tool integration platform. Modern dark with colorful integration icons |
| `hashicorp` | HashiCorp | Infrastructure automation. Enterprise-clean, black and white |
| `mongodb` | MongoDB | Document database. Green leaf branding, developer documentation focus |
| `posthog` | PostHog | Product analytics. Playful hedgehog branding, developer-friendly dark UI |
| `sanity` | Sanity | Headless content platform with a dark-first editorial marketing surface — 112px display type, IBM Plex Mono technical eyebrows, and a single coral-red accent reserved for the highest-priority CTA. |
| `sentry` | Sentry | Error monitoring. Dark dashboard, data-dense, pink-purple accent |
| `supabase` | Supabase | Open-source Firebase alternative. Dark emerald theme, code-first |

### Productivity & SaaS

| Folder | Site | Look |
|---|---|---|
| `cal` | Cal.com | Open-source scheduling. Clean neutral UI, developer-oriented simplicity |
| `intercom` | Intercom | Customer messaging. Friendly blue palette, conversational UI patterns |
| `linear.app` | Linear | Project management for engineers. Ultra-minimal, precise, purple accent |
| `mintlify` | Mintlify | Documentation platform. Clean, green-accented, reading-optimized |
| `notion` | Notion | All-in-one workspace. Warm minimalism, serif headings, soft surfaces |
| `resend` | Resend | Email API for developers. Minimal dark theme, monospace accents |
| `zapier` | Zapier | Automation platform. Warm orange, friendly illustration-driven |

### Design & Creative Tools

| Folder | Site | Look |
|---|---|---|
| `airtable` | Airtable | Spreadsheet-database hybrid. Colorful, friendly, structured data aesthetic |
| `clay` | Clay | Creative agency. Organic shapes, soft gradients, art-directed layout |
| `figma` | Figma | Collaborative design tool. Vibrant multi-color, playful yet professional |
| `framer` | Framer | Website builder. Bold black and blue, motion-first, design-forward |
| `miro` | Miro | Visual collaboration. Bright yellow accent, infinite canvas aesthetic |
| `webflow` | Webflow | Visual web builder. Blue-accented, polished marketing site aesthetic |

### Fintech & Crypto

| Folder | Site | Look |
|---|---|---|
| `binance` | Binance | Crypto exchange. Bold Binance Yellow on monochrome, trading-floor urgency |
| `coinbase` | Coinbase | Crypto exchange. Clean blue identity, trust-focused, institutional feel |
| `kraken` | Kraken | Crypto trading platform. Purple-accented dark UI, data-dense dashboards |
| `mastercard` | Mastercard | Global payments network. Warm cream canvas, orbital pill shapes, editorial warmth |
| `revolut` | Revolut | Digital banking. Sleek dark interface, gradient cards, fintech precision |
| `stripe` | Stripe | Payment infrastructure. Signature purple gradients, weight-300 elegance |
| `wise` | Wise | International money transfer. Bright green accent, friendly and clear |

### E-commerce & Retail

| Folder | Site | Look |
|---|---|---|
| `airbnb` | Airbnb | Travel marketplace. Warm coral accent, photography-driven, rounded UI |
| `meta` | Meta | Tech retail store. Photography-first, binary light/dark surfaces, Meta Blue CTAs |
| `nike` | Nike | Athletic retail. Monochrome UI, massive uppercase Futura, full-bleed photography |
| `shopify` | Shopify | E-commerce platform. Dark-first cinematic, neon green accent, ultra-light display type |
| `starbucks` | Starbucks | Coffee retail flagship. Four-tier earth-green system, warm cream canvas, proprietary SoDoSans typography |

### Media & Consumer Tech

| Folder | Site | Look |
|---|---|---|
| `apple` | Apple | Consumer electronics. Premium white space, SF Pro, cinematic imagery |
| `hp` | HP | PC and printer maker. Pure white canvas, HP Electric Blue signal CTA, geometric Forma DJR Micro, blue chevron decorations |
| `ibm` | IBM | Enterprise technology. Carbon design system, structured blue palette |
| `nvidia` | NVIDIA | GPU computing. Green-black energy, technical power aesthetic |
| `pinterest` | Pinterest | Visual discovery platform. Red accent, masonry grid, image-first |
| `playstation` | PlayStation | Gaming console retail. Three-surface channel layout, cyan hover-scale interaction |
| `spacex` | SpaceX | Space technology. Stark black and white, full-bleed imagery, futuristic |
| `spotify` | Spotify | Music streaming. Vibrant green on dark, bold type, album-art-driven |
| `theverge` | The Verge | Tech editorial media. Acid-mint and ultraviolet accents, Manuka display type |
| `uber` | Uber | Mobility platform. Bold black and white, tight type, urban energy |
| `vodafone` | Vodafone | Global telecom brand. Monumental uppercase display, Vodafone Red chapter bands |
| `wired` | WIRED | Tech magazine. Paper-white broadsheet density, custom serif, ink-blue links |

### Automotive

| Folder | Site | Look |
|---|---|---|
| `bmw` | BMW | Luxury automotive. Dark premium surfaces, precise German engineering aesthetic |
| `bmw-m` | BMW M | Performance automotive. Motorsport-inspired contrast, M color accents, precision-driven layout |
| `bugatti` | Bugatti | Luxury hypercar. Cinema-black canvas, monochrome austerity, monumental display type |
| `ferrari` | Ferrari | Luxury automotive. Chiaroscuro black-white editorial, Ferrari Red with extreme sparseness |
| `lamborghini` | Lamborghini | Luxury automotive. True black cathedral, gold accent, LamboType custom Neo-Grotesk |
| `renault` | Renault | French automotive. Vivid aurora gradients, NouvelR proprietary typeface, zero-radius buttons |
| `tesla` | Tesla | Electric vehicles. Radical subtraction, cinematic full-viewport photography, Universal Sans |

### Retro Web · DESIGN.md Nostalgia

| Folder | Site | Look |
|---|---|---|
| `dell-1996` | Dell (1996) | Catalog-era enterprise web. Literal black page frame, flat color-block "ribbon cards", chunky Helvetica-Black titles over Times Roman body, and hand-cut GIF stickers (NEW! bursts, award seals, beveled product photos). |
| `nintendo-2001` | Nintendo.com (2001) | Y2K "console chrome" web. Brushed-periwinkle beveled metal panels, a halftone-dotted carbon nav glowing amber, outlined Arial-Black box-art wordmarks over circuit-board hero fields, and a pixel Mario welcome bubble. |

### Other

| Folder | Site | Look |
|---|---|---|
| `slack` | Slack | An inspired interpretation of Slacc's design language — a workplace messaging brand built on a deep aubergine primary, with cream-lavender hero gradients, blue inline links, and pill CTAs. |
