# Animation Patterns

Inline one of these CSS blocks into the `<style>` section of your slide HTML.
Each block is self-contained. Choose one pattern per deck.

---

## Pattern A — Fade (subtle, universal)

Best for: professional decks, text-heavy slides, low distraction.

```css
/* ── Fade ────────────────────────────────────────────── */
.slide {
  transition: opacity 0.45s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.slide.anim-enter-fade {
  animation: fadeIn 0.45s ease forwards;
}
```

---

## Pattern B — Slide Left (directional flow)

Best for: sequential storytelling, step-by-step walkthroughs.

```css
/* ── Slide Left ──────────────────────────────────────── */
.slide {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(60px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(-60px); }
  to   { opacity: 1; transform: translateX(0); }
}

.slide.anim-enter-slide-left {
  animation: slideInLeft 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}

/* Use data-dir="-1" on .stage when going backwards */
.stage[data-dir="-1"] .slide.anim-enter-slide-left {
  animation-name: slideInRight;
}
```

---

## Pattern C — Slide Up (upward momentum)

Best for: revealing conclusions, escalating points, finales.

```css
/* ── Slide Up ────────────────────────────────────────── */
.slide {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

@keyframes slideInUp {
  from { opacity: 0; transform: translateY(50px); }
  to   { opacity: 1; transform: translateY(0); }
}

.slide.anim-enter-slide-up {
  animation: slideInUp 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
```

---

## Pattern D — Zoom (emphasis / drama)

Best for: stats, key messages, title slides, "wow" moments.

```css
/* ── Zoom ────────────────────────────────────────────── */
.slide {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}

.slide.anim-enter-zoom {
  animation: zoomIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
```

---

## Pattern E — Flip (high-impact transitions)

Best for: creative decks, before/after comparisons, section breaks.

```css
/* ── Flip ────────────────────────────────────────────── */
.stage {
  perspective: 1200px;
}

.slide {
  backface-visibility: hidden;
  transition: opacity 0.5s ease, transform 0.5s ease;
}

@keyframes flipIn {
  from { opacity: 0; transform: rotateY(-15deg) translateX(80px); }
  to   { opacity: 1; transform: rotateY(0) translateX(0); }
}

.slide.anim-enter-flip {
  animation: flipIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
}
```

---

## Pattern F — Mixed (per-slide animations)

Use this when `data-animate` values differ per slide.
Combines all patterns so each slide can declare its own.

```css
/* ── Mixed / Per-slide ───────────────────────────────── */
.slide {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(60px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes slideInUp {
  from { opacity: 0; transform: translateY(50px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes zoomIn {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}

.slide.anim-enter-fade       { animation: fadeIn      0.45s ease forwards; }
.slide.anim-enter-slide-left { animation: slideInLeft 0.4s  cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
.slide.anim-enter-slide-up   { animation: slideInUp   0.4s  cubic-bezier(0.25,0.46,0.45,0.94) forwards; }
.slide.anim-enter-zoom       { animation: zoomIn      0.4s  cubic-bezier(0.34,1.56,0.64,1)    forwards; }
```

---

## Staggered List Items

Add this block alongside any pattern above to animate list items sequentially.

```css
/* ── Staggered list items ────────────────────────────── */
@keyframes itemIn {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: translateY(0); }
}

.slide.active li {
  animation: itemIn 0.4s ease both;
}

/* Stagger delay: up to 8 items */
.slide.active li:nth-child(1) { animation-delay: 0.15s; }
.slide.active li:nth-child(2) { animation-delay: 0.25s; }
.slide.active li:nth-child(3) { animation-delay: 0.35s; }
.slide.active li:nth-child(4) { animation-delay: 0.45s; }
.slide.active li:nth-child(5) { animation-delay: 0.55s; }
.slide.active li:nth-child(6) { animation-delay: 0.65s; }
.slide.active li:nth-child(7) { animation-delay: 0.75s; }
.slide.active li:nth-child(8) { animation-delay: 0.85s; }
```

---

## Disable All Animations

For static / printable output, use this instead of any pattern above.

```css
/* ── No animations ───────────────────────────────────── */
.slide {
  transition: none !important;
  animation:  none !important;
}

.slide.active {
  opacity: 1;
}
```

---

## Reduced Motion (always include)

Append this block after any animation pattern to respect user preferences.

```css
/* ── Respect prefers-reduced-motion ─────────────────── */
@media (prefers-reduced-motion: reduce) {
  .slide,
  .slide * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```
