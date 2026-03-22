# Frontend Slides Skill

Create beautiful, interactive HTML presentation slides from any content source — text descriptions, outlines, Markdown, or PowerPoint files.

## Trigger Conditions

Use this skill when the user:
- Asks to "create slides", "make a presentation", or "build a deck"
- Provides a `.pptx` / `.ppt` file and wants it converted to HTML
- Wants to turn a Markdown outline or bullet list into a slideshow
- Requests a "one-pager", "pitch deck", or "slide deck"

## Workflow

### 1. Gather Requirements

Ask (or infer from context):
- **Content**: What is the topic / what content should appear on the slides?
- **Style**: Which preset? (See `STYLE_PRESETS.md`) Default: `dark-minimal`
- **Count**: How many slides? (Default: infer from content)
- **Animations**: Enabled by default; disable if user wants static output
- **Source file**: If a `.pptx` is provided, run `scripts/extract-pptx.py` first

### 2. Extract PPTX (if applicable)

```bash
python3 ~/.claude/skills/frontend-slides/scripts/extract-pptx.py <file.pptx> --out slides.json
```

The script outputs `slides.json` with an array of slide objects:
```json
[
  {
    "index": 0,
    "title": "Slide Title",
    "body": ["Bullet one", "Bullet two"],
    "notes": "Speaker notes",
    "images": ["base64_or_path"]
  }
]
```

### 3. Build the HTML File

Use `html-template.md` for the full boilerplate. Key rules:

- **One HTML file** — all CSS and JS inlined, no external dependencies
- **Viewport units** — use the patterns in `viewport-base.css` for responsive sizing
- **Slide container**: `<div class="slide" data-index="N">` for each slide
- **Navigation**: arrow keys, swipe, and on-screen buttons
- **Animations**: pick from `animation-patterns.md` or disable with `data-animate="false"`

### 4. Style Application

Copy the chosen preset block from `STYLE_PRESETS.md` into the `<style>` section.
Presets define: color palette, font stack, heading sizes, accent colors.

### 5. Output

- Write the file as `slides.html` (or a name the user specifies)
- Print a summary: number of slides, preset used, file size
- Offer to open in browser or adjust styles

## File Size Guidelines

| Slides | Target size |
|--------|-------------|
| ≤ 10   | < 50 KB     |
| 11–30  | < 150 KB    |
| 31+    | < 400 KB    |

Inline images as base64 only if < 100 KB each; otherwise use `<img src="path">`.

## Accessibility

- Every slide must have an `aria-label` on the `.slide` div
- Color contrast ratio ≥ 4.5:1 for body text
- Keyboard navigation always enabled

## Example Invocations

```
/frontend-slides Create a 5-slide intro deck about our API product, dark theme
/frontend-slides Convert keynote.pptx to HTML with the "corporate-light" preset
/frontend-slides Turn this outline into slides: [outline text]
```
