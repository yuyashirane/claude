# Style Presets

Copy the desired `:root` block and font imports into the `<style>` section of the slide HTML.

---

## dark-minimal *(default)*

Clean dark background, high-contrast white text, single accent color.

```css
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
```

---

## light-clean

Bright white surface, dark text, teal accent. Good for docs / tutorials.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap');

:root {
  --bg:         #ffffff;
  --surface:    #f5f5f5;
  --border:     #e0e0e0;
  --text:       #1a1a1a;
  --text-muted: #666666;
  --accent:     #0ea5e9;
  --accent-alt: #38bdf8;
  --heading-size: clamp(1.8rem, 4vw, 3.2rem);
  --body-size:    clamp(0.95rem, 1.8vw, 1.4rem);
  --font:       'Inter', system-ui, sans-serif;
  --radius:     12px;
}
```

---

## corporate-light

Conservative blue/grey palette, serif headings. Suits business / finance decks.

```css
@import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&family=Source+Sans+3:wght@400;600&display=swap');

:root {
  --bg:         #f8f9fa;
  --surface:    #ffffff;
  --border:     #dee2e6;
  --text:       #212529;
  --text-muted: #6c757d;
  --accent:     #1d4ed8;
  --accent-alt: #3b82f6;
  --heading-size: clamp(1.6rem, 3.5vw, 2.8rem);
  --body-size:    clamp(0.9rem, 1.6vw, 1.25rem);
  --font-heading: 'Merriweather', Georgia, serif;
  --font:         'Source Sans 3', system-ui, sans-serif;
  --radius:     6px;
}

/* Override heading font for corporate preset */
.slide h1, .slide h2, .slide h3 {
  font-family: var(--font-heading);
}
```

---

## neon-dark

Vibrant neon accents on near-black. Ideal for tech demos, hackathons.

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap');

:root {
  --bg:         #050510;
  --surface:    #0f0f1f;
  --border:     #1e1e3f;
  --text:       #e8e8ff;
  --text-muted: #6060a0;
  --accent:     #00f5c4;
  --accent-alt: #ff00aa;
  --heading-size: clamp(1.8rem, 4vw, 3.4rem);
  --body-size:    clamp(0.95rem, 1.8vw, 1.4rem);
  --font:       'Space Grotesk', system-ui, sans-serif;
  --radius:     16px;
}
```

---

## warm-earth

Warm beige and terracotta. Great for design, lifestyle, or creative decks.

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500&display=swap');

:root {
  --bg:         #fdf6ee;
  --surface:    #fef9f4;
  --border:     #e8d5c0;
  --text:       #2d1b0e;
  --text-muted: #8a6a55;
  --accent:     #c0562a;
  --accent-alt: #e07b50;
  --heading-size: clamp(1.8rem, 4vw, 3.2rem);
  --body-size:    clamp(0.95rem, 1.8vw, 1.3rem);
  --font-heading: 'DM Serif Display', Georgia, serif;
  --font:         'DM Sans', system-ui, sans-serif;
  --radius:     8px;
}

.slide h1, .slide h2, .slide h3 {
  font-family: var(--font-heading);
}
```

---

## gradient-dark

Full-slide gradient backgrounds, bold typography. High visual impact.

```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Inter:wght@400;500&display=swap');

:root {
  --bg:         #1a0533;
  --surface:    rgba(255,255,255,0.06);
  --border:     rgba(255,255,255,0.12);
  --text:       #ffffff;
  --text-muted: rgba(255,255,255,0.55);
  --accent:     #f59e0b;
  --accent-alt: #fbbf24;
  --heading-size: clamp(2rem, 4.5vw, 3.8rem);
  --body-size:    clamp(1rem, 1.9vw, 1.5rem);
  --font-heading: 'Syne', system-ui, sans-serif;
  --font:         'Inter', system-ui, sans-serif;
  --radius:     20px;
  /* Gradient applied per-slide via data-gradient attribute */
}

.slide h1, .slide h2 {
  font-family: var(--font-heading);
  font-weight: 800;
}

/* Slide-level gradient backgrounds */
.slide[data-gradient="purple"] { background: linear-gradient(135deg, #1a0533 0%, #4c0080 100%); }
.slide[data-gradient="blue"]   { background: linear-gradient(135deg, #0c1445 0%, #1a3a8f 100%); }
.slide[data-gradient="teal"]   { background: linear-gradient(135deg, #042f2e 0%, #0f766e 100%); }
.slide[data-gradient="rose"]   { background: linear-gradient(135deg, #2d0a18 0%, #9f1239 100%); }
```
