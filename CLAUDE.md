# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Static marketing site for Strategy West Planning, a financial planning firm. Pure HTML/CSS/JS — there is no build step, no package manager, no test suite, and no server-side code.

## Running locally

Open the HTML files directly in a browser (`open index.html`) or serve the directory with any static server, e.g. `python3 -m http.server 8000`. There is nothing to build, install, or compile.

## Architecture

### One file per page, fully self-contained

Each page is a single HTML file with:
- Inline `<style>` block at the top containing the entire stylesheet for that page.
- Page markup in the middle.
- Inline `<script>` block at the bottom containing all behavior for that page.

There are no shared CSS or JS files. The only shared assets are images in `images/` and Google Fonts loaded from CDN.

### Duplicated chrome across pages

The `<nav>` (desktop + mobile), the consultation-booking dropdown, the `<footer>`, and the navigation/scroll JavaScript are **copy-pasted into every page**. When you change nav links, footer content, or nav behavior, you must edit **every** HTML file — there is no template system or include mechanism. The only intended difference between two pages' nav blocks is that the link to the current page gets `class="active"` (see `cash-flow-banking.html` line 1199 vs. `index.html` line 1091).

When adding a new page, copy the nav + mobile nav + footer + nav script from an existing page verbatim, then add `class="active"` to the link that points to the new page.

### Design tokens

Each page declares the same design system as CSS custom properties on `:root` at the top of its `<style>` block (`--gold`, `--gold-light`, `--cream`, `--warm-white`, `--charcoal`, `--serif: 'Cormorant Garamond'`, `--sans: 'Jost'`, etc.). These values must stay in sync across pages — if you add a new token or change a color, update every page's `:root`. `cash-flow-banking.html` defines a few extras (`--charcoal-2`, `--gold-dim`, `--off-white`) used by its dark theme.

`index.html` uses a light theme (`background: var(--warm-white)`); `cash-flow-banking.html` uses a dark theme (`background: var(--charcoal-2)`). Service detail pages may follow either pattern.

### Page inventory and link targets

Live pages: `index.html`, `cash-flow-banking.html`.

The nav and footer link to many pages that **do not exist yet**: `college-planning.html`, `disability-planning.html`, `retirement-estate.html`, `about-us.html`, `blogs.html`, `articles.html`, `calculators.html`, `guides.html`, `faq.html`. Treat these as placeholders for pages to be built; clicking them currently 404s. When you build one, model the structure on `cash-flow-banking.html` (the established service-page pattern: hero → problem → benefits → candid → why → how → faq → cta → footer).

### Booking links

"Schedule a Consultation" routes to external booking URLs, not internal pages:
- Cash Flow Banking, College Planning, Retirement & Estate → HubSpot meetings under `meetings-na2.hubspot.com/will-smethurst/...`
- Disability Planning → `caringtide.com/free-consultation-2/` (a partner site, **not** HubSpot — easy to get wrong when copy-pasting)

These URLs appear in three places per page (nav dropdown, mobile nav, footer) and sometimes a fourth (in-page CTA section, e.g. `index.html` "consultDropdownSection"). Update all occurrences together.

### Navigation JavaScript

The script block at the bottom of each page wires up: the consultation dropdown(s), the mobile hamburger, mobile sub-menu accordions, auto-hide-on-scroll-down (mobile-only, under 768px), click-vs-hover dropdown behavior for the desktop nav on touch devices, and an "active link" highlight based on `window.location.href`. The script assumes specific element IDs exist (`consultBtn`, `consultWrap`, `consultDropdown`, `navHamburger`, `mobileNav`, etc.) — keep IDs intact when editing markup or the script will throw on load.

`index.html` has an additional second consultation dropdown inside an in-page CTA section (`consultBtnSection` / `consultDropdownSection`); its script is slightly longer than the service-page version because it manages both dropdowns.

## Brand & working preferences

## Brand
- Main site palette (`index.html`, `cash-flow-banking.html`, and other service/marketing pages): gold, cream, charcoal, black. **No green** — do not add a `--green` token to these pages.
- Calculator palette (separate files): dark green and gold.
- Fonts across both: Cormorant Garamond for headings, Jost for body.
- Use the CSS variables defined in each page; keep values consistent across pages of the same type (main site vs. calculator).
- Tone of voice in any client-facing copy: professional, trustworthy, conversational — never pushy or salesy.

## How I work
- Make ONE precise change at a time. Confirm with me before moving to the next.
- Don't refactor unrelated code without asking first.
- Hide advisor-only logic from client-facing pages.
- When working with brand assets (logos, headshots, images), always use the actual files I provide — never recreate logos programmatically or generate placeholders.
- Currently building: a Human Life Value calculator using the same green/gold palette and Cormorant Garamond + Jost fonts.

## Design discipline
- Always prioritize clean, minimal, high-end design.
- Avoid clutter, unnecessary elements, or over-complication.
- Maintain strong spacing and alignment.
- Every section must feel intentional.

## Consistency across pages
- Navigation must be identical across every page.
- Color palette and typography stay consistent.
- Buttons and CTAs follow the same style system.
- Standard nav: 112px height, logo height 104px, 14px tab text. Three tabs centered: "What We Do" dropdown (Cash Flow Banking, College Planning, Disability Planning, Retirement & Estate), "Resources" dropdown (Blogs, Articles, Financial Calculators, Guides), and "About Us" link.
- Standard footer: .footer-brand contains the logo only (no text below it). Resources column matches nav with the same four links.

## Page uniqueness for service pages
The four service pages (cash-flow-banking, college-planning, disability-planning, retirement-estate) must each have a unique layout, different section flow, and different visual composition. cash-flow-banking.html is a structural reference, not a template to clone across the others.

## Brand language rules
- Never refer to Cash Flow Banking as "life insurance" in client-facing copy.
- Preferred terms: capital strategy, liquidity, long-term control, structured wealth.
- Tone: calm, confident, intelligent.
- NEVER use em-dashes in any client-facing copy.

## Editing rules
- Only change what I explicitly ask for. Do not refactor unrelated code or change styling without permission.
- After making any change, clearly state what was changed and where.
- On revisions, only update the specified sections. Do not rebuild the entire page.

## Link handling
- Use placeholder href values for pages that don't exist yet (e.g., college-planning.html before it's built). The link stays; it just won't resolve until the page exists.
- Do not invent real URLs unless I provide them.
- Booking URLs: HubSpot for most services, caringtide.com for Disability Planning specifically. These appear in 3+ places per page (nav dropdown, mobile nav, footer, sometimes a CTA section). Update all occurrences together.

## Strict content isolation
Under no circumstances import or reuse content from external references, uploaded files, or example websites:
- Names of individuals, companies, or brands
- Testimonials, case studies, or statistics
External material is for structural understanding only. All output must be brand-clean, fully original, and exclusive to Strategy West Planning. When in doubt, default to original content.

## Build workflow
- Build one page at a time. Do not start another page unless explicitly instructed.
- Wait for feedback and approval before proceeding to the next.
- Surgical precision: no layout, spacing, color, or structure changes outside what I explicitly request.

## Deployment
- Files commit to GitHub; Netlify auto-deploys from there.
- Each HTML file must be clean, complete, and production-ready.
- No placeholder frameworks or partial builds.

## Priority order
Clarity > Simplicity > Elegance > Conversion.

## Reference materials
See `REFERENCES.md` at the repo root for structural/visual/layout reference URLs (our firm's sites and external sites). Per the content isolation rule above, those URLs are for structure only — never copy content, names, or statistics from them.
