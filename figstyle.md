# Goal: Build a Free Figma Plugin: "fig-deep-styles"

I need you to build a complete, production-ready local Figma plugin called **"fig-deep-styles"** (TypeScript + HTML/CSS UI).

## Problem Background

When copying CSS in Figma, Figma only copies the styling of the currently selected parent node (e.g. padding, background, border-radius). It completely ignores child nodes like text layers, headings, and nested layout wrappers.

## Core Objective

Create a Figma plugin that recursively traverses the currently selected node (and all its children) and extracts:

1. **Container / Layout styles**: width, height, padding (top/right/bottom/left), gap/itemSpacing, layoutMode (flex direction: row/column), primary/counter axis alignments, borderRadius, background color (solid hex/rgba & gradients), strokes/borders, and drop-shadows.
2. **Typography / Text styles**: text content, font family, font style/weight, font size, line height, letter spacing, text alignment, and text color using `getStyledTextSegments` for multi-style text.
3. **SVG & Icon Assets**: Automatic detection of vector icons and shapes, exporting raw `<svg>` code via `node.exportAsync({ format: 'SVG' })` into an asset dictionary.

## Required Features & Outputs

### 1. Recursive Node Traversal (`code.ts`)

- Listen to `figma.on("selectionchange")` and on-demand trigger.
- Recursively traverse `figma.currentPage.selection`.
- If no layer is selected, prompt the user in the UI to select a layer.
- Handle different node types gracefully: `FRAME`, `GROUP`, `TEXT`, `RECTANGLE`, `COMPONENT`, `INSTANCE`, `VECTOR`, `BOOLEAN_OPERATION`.
- Accurately convert Figma colors (`fills` with `{r, g, b, a}`) into standard Hex and RGBA strings.
- Extract typography values (`node.getStyledTextSegments`, `node.fontSize`, `node.fontName`, `node.lineHeight`, `node.letterSpacing`, `node.characters`).
- Batch export vector icons into clean SVG markup.

### 2. Output Formats in Plugin UI (`ui.html`)

Provide tabs to display and copy the generated data in 3 specialized formats:

1. **AI Spec (Prompt + JSON Tree + Inlined SVGs)**:
   - Primary format designed for AI coding agents (Antigravity, Cursor, Claude).
   - Contains the exact layout tree (gaps, paddings, alignments) + typography tokens + embedded SVG dictionary.
   - Eliminates the 15-20% gap of AI guessing spacing or hallucinating generic icons.
2. **Stylesheets (Vanilla CSS & React Native)**:
   - Modern BEM/kebab-case CSS with tree path comments (`/* Root > Header > UserTitle */`).
   - CamelCase React Native `StyleSheet.create({ ... })`.
3. **SVGs & Assets Gallery**:
   - Visual cards showing rendered SVG icons with dimension badges.
   - 1-click individual "Copy SVG" and "Copy All SVGs (JSON)".

### 3. UI Requirements

- Clean, modern, compact Figma-like design (dark/light theme compatible, clean typography, monospace code preview area).
- **"Copy to Clipboard" button** for each format with instant visual feedback ("Copied!").
- Dynamic updates when changing selections on the Figma canvas, or a "Refresh" button.

### 4. Project Structure & Configuration

- `manifest.json` (Figma Plugin manifest v3 configured with UI support).
- `package.json` (with build scripts using `esbuild` for fast bundling).
- `tsconfig.json`
- `build.js` (Asset copy and esbuild compiler).
- `src/code.ts` (Figma sandbox logic: node tree traversal, style extraction, messaging, SVG export).
- `src/ui.html` (Plugin UI: HTML, CSS, and JS to receive data, format code snippets, and copy to clipboard).
- `README.md` (Step-by-step instructions on importing and using with AI agents).

