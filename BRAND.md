# 6.11 TruckOS: brand colours

Three brand colours, one job each. Everything else is a neutral (ink, greys, white) or a status colour.

| Colour | Hex (approx.) | Token | Used for |
|---|---|---|---|
| **Logo Blue** (from the 6.11 logo) | `#0340CF` | `brand-blue`, `text-link`, `--link` | text links, focus ring, text selection, "info" |
| **Signal Green** | `#22C55E` | `brand-green`, `text-accent` | main buttons (CTA), live / moving, success |
| **Speed Amber** (from the logo's speed lines) | `#F5A524` | `brand-amber`, `brand-amber-dark` | attention, stopped trucks, highlights |

Where they live (change them in one place):
- `tailwind.config.js` -> `colors.brand` (`green`, `blue`, `amber`, with `-light`, `-dark`, `-hover` steps) and `colors.link`
- `src/index.css` -> `--link` (Day and Night values) and the focus / selection rules

Rules: one blue for links (never green text for a link), green only for the main action and live state,
amber only to draw attention. Red stays for errors and danger.

## Every colour the website uses (audit)

**Brand (3):** Logo Blue `#0340CF` (links/focus), Signal Green `#22C55E` (actions, live, with `#16A34A` for text on white and `#052E16` for text on green), Speed Amber `#F59E0B`.

**Neutrals (text and surfaces):** Ink `#111827`, Slate text `#6B7280`, Soft text `#9CA3AF`, Line `#E5E7EB`, Page `#F3F4F6`, Panel `#F9FAFB`, White `#FFFFFF`; Night: `#080B10` / `#0B0F14` page, `#0B1220` panel, `#1F2937` raised.

**Status:** Danger `#EF4444`, Info `#3B82F6`, Warning = Speed Amber, Offline `#94A3B8`.

Kept to this list on purpose: new colours should come from it, not be added per page.
