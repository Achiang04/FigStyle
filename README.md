# FigStyles 🚀
> **1-Click Deep Design Spec, Styles, and SVG Asset Extractor for Figma & AI Coding Agents**

When you copy CSS in Figma natively, it only copies the outermost parent node, ignoring all child wrappers, typography, padding/gaps, and vector icons. 

**FigStyles** solves this by recursively traversing the selected screen, extracting exact AutoLayout spacing tokens, rich typography segments, and exporting raw `<svg>` code for all vector icons on the screen in **one single copy action**.

---

## 🌟 Key Features

1. **🤖 AI-Optimized Spec (Prompt + JSON Tree)**
   - Formatted specifically for AI coding agents (**Google Antigravity**, **Cursor**, **Claude**).
   - Contains the full hierarchical tree with exact AutoLayout properties (`gap`, `padding`, `flexDirection`, `alignItems`, `justifyContent`).
   - Every text node has exact font family, weight, size, line-height, and color.
   - Embeds raw `<svg>` code for every icon found in the screen.
   - **Eliminates the 15–20% gap** where AI agents hallucinate spacing or use generic icon libraries.

2. **🎨 Multi-Format Stylesheets**
   - **Vanilla CSS**: Clean, deduplicated BEM/kebab-case classes with breadcrumb comments showing layer hierarchy (`/* Screen > Header > Avatar */`).
   - **React Native**: CamelCase `StyleSheet.create({ ... })` ready to drop into React Native or Unistyles.

3. **📦 SVGs & Asset Gallery**
   - Visual preview cards for all vector icons and shapes on the screen.
   - 1-click **"Copy SVG"** for individual icons.
   - **"Copy All SVGs (JSON)"** to export all screen icons as a structured dictionary.

---

## 🛠️ How to Install in Figma Desktop (30 Seconds)

1. Open **Figma Desktop**.
2. Navigate to the top menu:
   - **Plugins** ➔ **Development** ➔ **Import plugin from manifest...**
   - *(Or press `Cmd + /` and type `Import plugin from manifest`)*.
3. Browse to this project folder:
   ```
   /Users/jecky/Documents/Code/FigStyle/manifest.json
   ```
4. Select `manifest.json` and click **Open**.
5. FigStyles is now installed in your Figma Desktop!

---

## 💻 How to Use With Your AI Agent

1. In Figma, select any **Screen**, **Frame**, or **Component**.
2. Run the plugin (**Plugins ➔ Development ➔ FigStyles**).
3. Click the primary button: **"Copy AI Spec"**.
4. In your AI agent chat prompt, simply paste the copied text:
   > *"Build this screen in React / React Native. Here is the screenshot (attached) and here is the exact Figma Design Spec & SVGs: [PASTE]"*
5. The AI agent will use the exact tokens and raw SVGs, resulting in 100% pixel-perfect implementation!

---

## 🧑‍💻 Local Development & Rebuilding

If you make modifications to the plugin:

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Watch mode for rapid UI development
npm run watch
```

In Figma, right-click canvas ➔ **Plugins** ➔ **Development** ➔ **FigStyles** (or hit `Option + Cmd + P` to re-run the last plugin).
