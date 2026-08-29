# Diego Henrique Luciano — Portfolio

Static site. No build step. Plain HTML + CSS + vanilla JS, with GSAP loaded from a CDN.

## Structure

| File | Purpose |
| --- | --- |
| `index.html` | Home — scroll-scrub hero + horizontal case-study galleries |
| `all-work.html` | Full project list (same gallery pattern) |
| `404.html` | GitHub Pages fallback |
| `style.css` | All styles (dark theme, single stylesheet) |
| `script.js` | Lenis smooth scroll · scroll-scrub hero engine · reveal-on-scroll · pinned stats & pillars · GSAP horizontal galleries |
| `favicon.svg` | "DHL" logo mark traced from Covered By Your Grace (vector paths, no font dep) |
| `fx.js` | WebGL particle field — one point cloud, fixed + screen-blended behind the page, that transmorphs formation per section (hero floor-glow band → data grid → dispersed cloud → trembling ring → explode/leave → constellation). Soft mouse repulsion in the hero. No dependency; skipped for reduced-motion / no WebGL. |
| Loader (index.html) | The 3 hero-title lines start as bars that grow in place (one per real milestone: scripts+CSS · fonts · hero video ready), then a top-to-bottom curtain reveals each word; then DESIGN ENGINEER, the tag row, and finally the video (blur→sharp) + particle field. Pure DOM/GSAP in `script.js`, gated on `<html class="js">`; no-JS shows everything. |
| `assets/hero/` | Self-hosted hero video (`hero-scrub.mp4`) + poster |
| `assets/work/` | Case-study screenshots (`.webp` + `.jpg` fallback) |
| `assets/vendor/lenis.min.js` | Vendored smooth-scroll lib (Lenis 1.1.20) |

## Scroll architecture

`script.js` runs several independent blocks that all share one ScrollTrigger instance:

- **Lenis** eases native scroll and pumps `ScrollTrigger.update()` each frame. It also
  forces `scroll-behavior: auto` so pins/scrubs stay frame-exact. Skipped for reduced motion.
- Three **pinned scroll-locks**, top to bottom: stats (`data-stats`), pillars
  (`data-pillars`), then the per-project horizontal galleries (`data-hg`).
- **`refreshPriority` matters**: stats `3`, pillars `2`, galleries `1`. Higher =
  refreshed first, so each pin's spacer is measured before the sections below it
  recompute. Getting this wrong leaves gaps between sections on load.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>. Any static server works — the hero video is
fetched with `fetch()` as a blob, so it must be served over HTTP, not `file://`.

## Deploy to GitHub Pages

1. `git init && git add . && git commit -m "Portfolio site"`
2. Create a repo and push to `main`.
3. Repo → Settings → Pages → Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. `.nojekyll` is already present so `assets/` is served untouched.
5. Update the absolute URLs (`https://diegohenriqueluciano.github.io/...`) in the
   `<link rel="canonical">` and `og:*` tags of `index.html` / `all-work.html`
   if the final Pages URL differs.

## External dependencies

- **GSAP 3.15.0** (`gsap.min.js` + `ScrollTrigger.min.js`) — cdnjs. If it fails to
  load, the galleries degrade to native horizontal swipe and the pinned sections
  just stack (progressive enhancement).
- **Lenis 1.1.20** — vendored at `assets/vendor/lenis.min.js` (no CDN). Optional;
  the page scrolls natively without it.
- **Google Fonts** — Oswald, Inter, Covered By Your Grace.
- Hero video was generated in **Higgsfield**, upscaled in **Magnific** (Precision),
  and is vendored into `assets/hero/`.

## Regenerating assets

Hero video re-encoded for smooth scrubbing (dense keyframes):

```bash
ffmpeg -i source.mp4 -an -c:v libx264 -preset slow -crf 24 \
  -g 6 -keyint_min 6 -sc_threshold 0 -pix_fmt yuv420p \
  -movflags +faststart assets/hero/hero-scrub.mp4
```

Screenshots → WebP (via Pillow): quality 78, method 6.
