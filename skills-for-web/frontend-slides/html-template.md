# HTML Slide Template

This is the canonical boilerplate for generated slide decks. Replace the
placeholder comments with real content. All CSS and JS must be inlined —
no external dependencies.

## Full Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><!-- PRESENTATION TITLE --></title>
  <style>
    /* ── 1. Paste chosen preset from STYLE_PRESETS.md ── */
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');
    :root {
      --bg:         #0d0d0d;
      --surface:    #1a1a1a;
      --border:     #2e2e2e;
      --text:       #f0f0f0;
      --text-muted: #888888;
      --accent:     #6c63ff;
      --accent-alt: #a78bfa;
      --heading-size: clamp(1.8rem, 4vw, 3.2rem);
      --body-size:    clamp(0.95rem, 1.8vw, 1.4rem);
      --font:       'Inter', system-ui, sans-serif;
      --radius:     12px;
    }

    /* ── 2. Paste full contents of viewport-base.css ── */
    /* [viewport-base.css contents here] */

    /* ── 3. Paste animation block from animation-patterns.md ── */
    /* [chosen animation block here] */

    /* ── 4. Slide-specific overrides (optional) ── */
  </style>
</head>
<body>

  <div class="progress" id="progress"></div>

  <div class="stage" id="stage">

    <!-- ═══════════════════════════════════════════════════
         SLIDE 1 — Title Slide
         aria-label: brief description for screen readers
         data-animate: "fade" | "slide-left" | "slide-up" | "zoom" | "false"
    ════════════════════════════════════════════════════ -->
    <div class="slide active" data-index="0" data-animate="fade"
         aria-label="Title slide: [PRESENTATION TITLE]">
      <span class="label"><!-- e.g. "Company Name · 2026" --></span>
      <h1><!-- Main Title --></h1>
      <p class="muted"><!-- Subtitle or speaker name --></p>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE 2 — Section / Divider
    ════════════════════════════════════════════════════ -->
    <div class="slide" data-index="1" data-animate="slide-left"
         aria-label="Section: [SECTION NAME]">
      <span class="label">Section 01</span>
      <h2><!-- Section Title --></h2>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE 3 — Bullet List
    ════════════════════════════════════════════════════ -->
    <div class="slide" data-index="2" data-animate="slide-left"
         aria-label="Slide: [SLIDE TITLE]">
      <h2><!-- Slide Title --></h2>
      <ul>
        <li><!-- Point one --></li>
        <li><!-- Point two --></li>
        <li><!-- Point three --></li>
      </ul>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE 4 — Two Column (split layout)
    ════════════════════════════════════════════════════ -->
    <div class="slide" data-index="3" data-animate="slide-up"
         aria-label="Slide: [SLIDE TITLE]">
      <h2><!-- Slide Title --></h2>
      <div class="split mt-md">
        <div>
          <h3>Left Column</h3>
          <p><!-- Left content --></p>
        </div>
        <div>
          <h3>Right Column</h3>
          <p><!-- Right content --></p>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE 5 — Card Grid
    ════════════════════════════════════════════════════ -->
    <div class="slide" data-index="4" data-animate="zoom"
         aria-label="Slide: [SLIDE TITLE]">
      <h2><!-- Slide Title --></h2>
      <div class="card-grid">
        <div class="card">
          <h3>Card A</h3>
          <p><!-- Card content --></p>
        </div>
        <div class="card">
          <h3>Card B</h3>
          <p><!-- Card content --></p>
        </div>
        <div class="card">
          <h3>Card C</h3>
          <p><!-- Card content --></p>
        </div>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE 6 — Code Snippet
    ════════════════════════════════════════════════════ -->
    <div class="slide" data-index="5" data-animate="slide-left"
         aria-label="Slide: [SLIDE TITLE]">
      <h2><!-- Slide Title --></h2>
      <pre><code class="language-js">// Example code
const greet = (name) => `Hello, ${name}!`;
console.log(greet('World'));</code></pre>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE 7 — Big Stat / Quote
    ════════════════════════════════════════════════════ -->
    <div class="slide text-center" data-index="6" data-animate="zoom"
         aria-label="Slide: [STAT OR QUOTE]">
      <h1 class="accent" style="font-size: clamp(4rem, 12vw, 10rem); line-height:1;">
        <!-- e.g. 97% -->
      </h1>
      <p><!-- Context / caption --></p>
    </div>

    <!-- ═══════════════════════════════════════════════════
         SLIDE N — Thank You / End
    ════════════════════════════════════════════════════ -->
    <div class="slide text-center" data-index="7" data-animate="fade"
         aria-label="Thank you slide">
      <h1>Thank You</h1>
      <p class="muted"><!-- Name · email · website --></p>
    </div>

  </div><!-- /stage -->

  <!-- Navigation -->
  <nav class="nav" aria-label="Slide navigation">
    <button id="btn-prev" aria-label="Previous slide">← Prev</button>
    <button id="btn-next" aria-label="Next slide">Next →</button>
  </nav>

  <div class="slide-number" id="slide-number" aria-live="polite"></div>

  <script>
    // ── Slide Controller ──────────────────────────────────
    const slides     = Array.from(document.querySelectorAll('.slide'));
    const total      = slides.length;
    const progress   = document.getElementById('progress');
    const counter    = document.getElementById('slide-number');
    let   current    = 0;

    function goTo(index, dir = 1) {
      if (index < 0 || index >= total) return;
      const prev = slides[current];
      const next = slides[index];

      prev.classList.remove('active');
      next.classList.add('active');

      // Trigger animation
      const anim = next.dataset.animate;
      if (anim && anim !== 'false') {
        next.classList.add(`anim-enter-${anim}`);
        next.addEventListener('animationend', () => {
          next.classList.remove(`anim-enter-${anim}`);
        }, { once: true });
      }

      current = index;
      updateUI();
    }

    function updateUI() {
      counter.textContent = `${current + 1} / ${total}`;
      progress.style.width = `${((current + 1) / total) * 100}%`;
    }

    // Button controls
    document.getElementById('btn-next').addEventListener('click', () => goTo(current + 1));
    document.getElementById('btn-prev').addEventListener('click', () => goTo(current - 1));

    // Keyboard
    document.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown'  || e.key === ' ') goTo(current + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')                     goTo(current - 1);
      if (e.key === 'Home') goTo(0);
      if (e.key === 'End')  goTo(total - 1);
    });

    // Touch / swipe
    let touchX = 0;
    document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; });
    document.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) goTo(dx < 0 ? current + 1 : current - 1);
    });

    // Init
    updateUI();
  </script>

</body>
</html>
```

## Slide Type Reference

| Type            | Key classes / structure                        |
|-----------------|------------------------------------------------|
| Title           | `<h1>` + `.label` + `.muted` subtitle          |
| Section divider | `.label` + `<h2>`                              |
| Bullet list     | `<h2>` + `<ul><li>…`                           |
| Two-column      | `<h2>` + `.split > div + div`                  |
| Card grid       | `<h2>` + `.card-grid > .card`                  |
| Code snippet    | `<h2>` + `<pre><code class="language-X">`      |
| Big stat        | `.text-center` + oversized `<h1 class="accent">` |
| Image + text    | `.image-right` + `.content` + `<img class="image">` |
| Quote           | `.text-center` + `<blockquote>` + `<cite>`     |

## data-animate Values

| Value        | Effect                        |
|--------------|-------------------------------|
| `fade`       | Opacity fade in               |
| `slide-left` | Slide in from the right       |
| `slide-up`   | Slide in from the bottom      |
| `zoom`       | Scale from 0.92 → 1           |
| `false`      | No animation (instant switch) |
