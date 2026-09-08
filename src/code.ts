/// <reference types="@figma/plugin-typings" />

// Show UI with comfortable dimensions
figma.showUI(__html__, { width: 540, height: 680, themeColors: true });

// Listen to selection changes on the canvas
figma.on("selectionchange", () => {
  extractCurrentSelection();
});

// Handle messages from the UI
figma.ui.onmessage = async (msg: { type: string; options?: any }) => {
  if (msg.type === "extract") {
    await extractCurrentSelection(msg.options);
  } else if (msg.type === "notify") {
    figma.notify(msg.options?.message || "Notification", {
      timeout: msg.options?.timeout || 2000,
    });
  } else if (msg.type === "resize") {
    figma.ui.resize(msg.options.width, msg.options.height);
  }
};

interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface ExtractedTextSegment {
  text: string;
  fontFamily: string;
  fontWeight: string | number;
  fontSize: number;
  lineHeight?: string;
  letterSpacing?: string;
  color?: string;
}

interface ExtractedNode {
  id: string;
  name: string;
  cleanName: string;
  type: string;
  visible: boolean;
  width: number;
  height: number;
  layout?: {
    mode: "NONE" | "ROW" | "COLUMN";
    wrap: boolean;
    gap: number;
    padding: { top: number; right: number; bottom: number; left: number };
    justifyContent: string;
    alignItems: string;
    horizontalSizing: string;
    verticalSizing: string;
    isAbsolute: boolean;
  };
  absolutePosition?: {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
  };
  styles: {
    backgroundColor?: string;
    gradient?: string;
    borderRadius?: number | string;
    border?: string;
    boxShadow?: string;
    opacity?: number;
    overflow?: string;
  };
  typography?: {
    characters: string;
    segments: ExtractedTextSegment[];
    textAlign?: string;
  };
  assetKey?: string;
  children?: ExtractedNode[];
}

interface ExtractedAsset {
  name: string;
  type: "vector" | "image";
  width: number;
  height: number;
  svg: string;
  dataUri?: string;
}

interface AssetMap {
  [key: string]: ExtractedAsset;
}

// Convert Figma float RGB(0..1) to Hex
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.min(Math.max(n, 0), 1) * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Convert Figma float RGB(0..1) + A(0..1) to RGBA or Hex
function paintToColorString(paint: SolidPaint): string {
  const alpha = paint.opacity !== undefined ? paint.opacity : 1;
  const hex = rgbToHex(paint.color.r, paint.color.g, paint.color.b);
  if (alpha < 1) {
    const r = Math.round(paint.color.r * 255);
    const g = Math.round(paint.color.g * 255);
    const b = Math.round(paint.color.b * 255);
    const a = Math.round(alpha * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return hex;
}

// Convert Gradient paint to CSS linear-gradient string
function gradientToCss(paint: GradientPaint): string {
  try {
    const stops = paint.gradientStops.map((stop) => {
      const alpha = stop.color.a !== undefined ? stop.color.a : 1;
      const color =
        alpha < 1
          ? `rgba(${Math.round(stop.color.r * 255)}, ${Math.round(
              stop.color.g * 255
            )}, ${Math.round(stop.color.b * 255)}, ${
              Math.round(alpha * 100) / 100
            })`
          : rgbToHex(stop.color.r, stop.color.g, stop.color.b);
      const pos = Math.round(stop.position * 100);
      return `${color} ${pos}%`;
    });
    return `linear-gradient(180deg, ${stops.join(", ")})`;
  } catch (e) {
    return "";
  }
}

// Sanitize string to clean identifier (kebab or camel)
function sanitizeIdentifier(name: string, casing: "kebab" | "camel" = "kebab"): string {
  let cleaned = name.replace(/[^a-zA-Z0-9_-]/g, " ").trim();
  if (!cleaned) cleaned = "element";

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (casing === "camel") {
    return parts
      .map((p, i) =>
        i === 0
          ? p.toLowerCase()
          : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
      )
      .join("");
  }
  return parts.map((p) => p.toLowerCase()).join("-");
}

// Map Figma font weight style string to numeric / CSS string
function mapFontWeight(style: string): string | number {
  const s = style.toLowerCase();
  if (s.includes("thin") || s.includes("hairline")) return 100;
  if (s.includes("extra light") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s.includes("normal") || s.includes("book")) return 400;
  if (s.includes("medium")) return 500;
  if (s.includes("semi bold") || s.includes("semibold") || s.includes("demi")) return 600;
  if (s.includes("extra bold") || s.includes("extrabold") || s.includes("heavy")) return 800;
  if (s.includes("black")) return 900;
  if (s.includes("bold")) return 700;
  return 400;
}

// Safe UTF-8 decoding without relying on TextDecoder (which does not exist in QuickJS)
function uint8ArrayToUtf8String(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch (_) {}
  }

  let out = "";
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const c = bytes[i++];
    if (c < 128) {
      out += String.fromCharCode(c);
    } else if (c > 191 && c < 224) {
      out += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
    } else if (c > 223 && c < 240) {
      out += String.fromCharCode(
        ((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)
      );
    } else if (c > 239 && c < 365) {
      const u =
        (((c & 7) << 18) |
          ((bytes[i++] & 63) << 12) |
          ((bytes[i++] & 63) << 6) |
          (bytes[i++] & 63)) -
        0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
    }
  }
  return out;
}

// Convert Uint8Array to base64 string safely across all JS runtimes (including QuickJS)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
    const enc3 = ((b2 & 15) << 2) | (b3 >> 6);
    const enc4 = b3 & 63;

    if (i + 1 >= len) {
      base64 += chars.charAt(enc1) + chars.charAt(enc2) + "==";
    } else if (i + 2 >= len) {
      base64 += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + "=";
    } else {
      base64 += chars.charAt(enc1) + chars.charAt(enc2) + chars.charAt(enc3) + chars.charAt(enc4);
    }
  }
  return base64;
}

// Timeout helper to guarantee async export calls never hang the plugin
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// Check if a node has any TEXT descendants with depth limit for performance
function hasTextDescendants(node: SceneNode, maxDepth = 6): boolean {
  if (node.type === "TEXT") return true;
  if (maxDepth <= 0) return false;
  if ("children" in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      if (hasTextDescendants(child, maxDepth - 1)) return true;
    }
  }
  return false;
}

// Check if a node has visible IMAGE fills
function hasImageFill(node: SceneNode): boolean {
  if ("fills" in node && Array.isArray(node.fills)) {
    return (node.fills as ReadonlyArray<Paint>).some(
      (f) => f.type === "IMAGE" && f.visible !== false
    );
  }
  return false;
}

// Collection / list keywords - these indicate a container of items rather than a single asset
const COLLECTION_CONTAINER_KEYWORDS = [
  "list", "group", "stack", "row", "col", "column", "grid", "collection", "container",
  "wrapper", "content", "items", "cards", "avatars", "icons"
];

// Keywords indicating standalone illustration or artwork (can be up to 700px)
const ILLUSTRATION_KEYWORDS = [
  "illustration", "illustrations", "illust", "graphic", "mascot", "character",
  "artwork", "banner", "doodle", "drawing", "scene"
];

// Single image asset keywords (e.g. avatar photos)
const IMAGE_ASSET_KEYWORDS = [
  "avatar", "thumb", "ava", "pic", "photo", "profile"
];

// Vector icon keywords (typically <= 160px)
const ICON_KEYWORDS = [
  "icon", "ic_", "ic-", "arrow", "chevron", "caret", "logo", "badge", "btn-icon",
  "close", "cancel", "dismiss", "cross", "search", "magnif", "star", "edit", "pencil",
  "pen", "clock", "time", "schedule", "history", "phone", "call", "whatsapp", "wa",
  "shield", "protect", "safety", "security", "location", "pin", "map", "gps", "marker",
  "sparkle", "sparkles", "calendar", "mail", "email", "chat", "message", "send", "check",
  "tick", "plus", "add", "minus", "trash", "delete", "bin", "filter", "sort", "settings",
  "setting", "gear", "cog", "bell", "notification", "heart", "favorite", "like", "share",
  "info", "help", "alert", "warning", "camera", "refresh", "reload", "sync", "upload",
  "download", "back", "next", "forward", "tab", "nav", "menu", "dots", "more", "eye",
  "lock", "unlock"
];

const ICON_LIBRARY_PREFIXES = [
  "lucide:", "mingcute:", "fluent:", "ph:", "heroicons:", "heroicon:", "tabler:",
  "feather:", "akar-icons:", "bx:", "bxs:", "carbon:", "ant-design:", "solar:",
  "ri:", "material:", "mdi:", "eva:", "akar:"
];

// Check if a container represents a collection of avatars (e.g. Avatar List, Avatar Row)
function isAvatarCollection(node: SceneNode): boolean {
  const nameLower = node.name.toLowerCase();

  // If explicitly named an illustration/graphic/artwork, it is NEVER an avatar collection
  if (ILLUSTRATION_KEYWORDS.some((kw) => nameLower.includes(kw))) {
    return false;
  }

  const isNamedAvatar =
    nameLower.includes("avatar") ||
    nameLower.includes("user") ||
    nameLower.includes("profile") ||
    nameLower.includes("member");

  const isCollectionWord =
    COLLECTION_CONTAINER_KEYWORDS.some((kw) => nameLower.includes(kw)) ||
    nameLower.endsWith("s");

  if (isNamedAvatar && isCollectionWord) return true;

  if ("children" in node && Array.isArray(node.children) && node.children.length > 1) {
    const isAutoLayout =
      "layoutMode" in node &&
      ((node as FrameNode).layoutMode === "HORIZONTAL" ||
        (node as FrameNode).layoutMode === "VERTICAL");

    // If an AutoLayout flex row contains 2 or more image children, it is an avatar row/collection
    if (isAutoLayout) {
      const imageChildrenCount = (node as any).children.filter((c: SceneNode) => hasImageFill(c)).length;
      if (imageChildrenCount >= 2) return true;
    }
  }

  return false;
}

// Check if node is an icon or vector / graphic asset container
function isIconOrAsset(node: SceneNode, isRoot: boolean): boolean {
  if (node.type === "DOCUMENT" || node.type === "PAGE") return false;
  if (node.type === "TEXT") return false;

  // Root screen frames/artboards should not be treated as assets
  if (isRoot && (node.width > 140 || node.height > 140)) return false;

  // If it contains text, it is a UI container (button, card, header), not an atomic graphic asset
  if (hasTextDescendants(node, 6)) {
    return false;
  }

  const nameLower = node.name.toLowerCase();

  // 1. If this is an Avatar List / group container, DO NOT collapse it into a single SVG!
  // Keep the container layout and let individual avatar children be extracted.
  if (isAvatarCollection(node)) {
    return false;
  }

  // 2. Standalone Illustrations & Artwork:
  // If the container is named as an illustration/graphic/artwork, ALWAYS keep it as 1 complete asset!
  const matchesIllustration = ILLUSTRATION_KEYWORDS.some((kw) => nameLower.includes(kw));
  if (matchesIllustration && node.width <= 700 && node.height <= 700) {
    return true;
  }

  // 3. Known icon library prefixes (e.g. lucide:home, mingcute:time-line)
  const hasPrefix = ICON_LIBRARY_PREFIXES.some((p) => nameLower.startsWith(p));
  if (hasPrefix && node.width <= 140 && node.height <= 140) {
    return true;
  }

  // 4. Single Avatar or Photo leaf element (has image fill and <= 1 child)
  if (hasImageFill(node)) {
    const childrenCount = "children" in node && Array.isArray(node.children) ? node.children.length : 0;
    if (childrenCount <= 1) {
      return true;
    }
  }

  // 5. Direct vector shapes are vector assets
  if (
    node.type === "VECTOR" ||
    node.type === "BOOLEAN_OPERATION" ||
    node.type === "STAR" ||
    node.type === "LINE" ||
    node.type === "POLYGON"
  ) {
    return true;
  }

  // 6. Containers: FRAME, GROUP, COMPONENT, INSTANCE
  if (
    node.type === "FRAME" ||
    node.type === "GROUP" ||
    node.type === "COMPONENT" ||
    node.type === "INSTANCE"
  ) {
    const childrenCount = "children" in node && Array.isArray(node.children) ? node.children.length : 0;

    // Figma GROUP with no text is typically an illustration, mascot, or graphic drawing
    if (node.type === "GROUP" && childrenCount > 0 && node.width <= 700 && node.height <= 700) {
      return true;
    }

    // Check if container has AutoLayout with multiple items (flex row/col)
    const isAutoLayoutContainer =
      "layoutMode" in node &&
      ((node as FrameNode).layoutMode === "HORIZONTAL" ||
        (node as FrameNode).layoutMode === "VERTICAL");

    if (isAutoLayoutContainer && childrenCount > 1) {
      // AutoLayout frames with multiple children are layout containers, not single assets
      return false;
    }

    // Check single avatar / photo keywords (e.g. "Avatar", "Photo", "Profile Pic")
    const matchesImageKw = IMAGE_ASSET_KEYWORDS.some((kw) => nameLower.includes(kw));
    if (matchesImageKw && childrenCount <= 1 && node.width <= 160 && node.height <= 160) {
      return true;
    }

    // Check icon keywords
    const matchesIconKw = ICON_KEYWORDS.some((kw) => nameLower.includes(kw));
    if (matchesIconKw && node.width <= 160 && node.height <= 160) {
      return true;
    }

    // Small graphic containers <= 48x48 with no text are almost universally icons/indicators
    if (node.width <= 48 && node.height <= 48) {
      return true;
    }

    // Containers up to 72x72 where width == height (square icon containers)
    if (node.width <= 72 && node.height <= 72 && Math.abs(node.width - node.height) <= 4) {
      return true;
    }
  }

  return false;
}

// Extract and export SVG (with timeout protection so Figma never freezes)
async function exportNodeToSvg(node: SceneNode): Promise<string | null> {
  const exportTask = (async () => {
    // Method 1: Try SVG_STRING directly (fastest, standard in modern Figma Plugin API)
    try {
      const svgString = await (node as any).exportAsync({
        format: "SVG_STRING",
        svgIdAttribute: false,
        svgOutlineText: false,
        svgSimplifyStroke: true,
      });
      if (typeof svgString === "string" && svgString.trim().length > 0) {
        return svgString;
      }
    } catch (_) {}

    // Method 2: Basic SVG_STRING without extra options
    try {
      const svgString = await (node as any).exportAsync({
        format: "SVG_STRING",
      });
      if (typeof svgString === "string" && svgString.trim().length > 0) {
        return svgString;
      }
    } catch (_) {}

    // Method 3: Binary SVG with safe decoding (no TextDecoder dependency)
    try {
      const bytes: Uint8Array = await node.exportAsync({
        format: "SVG",
      });
      if (bytes && bytes.length > 0) {
        return uint8ArrayToUtf8String(bytes);
      }
    } catch (e3) {
      console.warn(`Failed to export SVG for node ${node.name}:`, e3);
    }

    return null;
  })();

  return withTimeout(exportTask, 6000, null);
}

// Extract image asset as lightweight PNG & base64 dataUri
async function exportNodeToImage(
  node: SceneNode,
  maxDimension: number = 200
): Promise<{ dataUri: string; svgPreview: string } | null> {
  const exportTask = (async () => {
    try {
      const maxSide = Math.max(node.width, node.height);
      const scale = maxSide > maxDimension ? Math.round((maxDimension / maxSide) * 100) / 100 : 1;

      const bytes: Uint8Array = await node.exportAsync({
        format: "PNG",
        constraint: {
          type: "SCALE",
          value: Math.max(0.2, scale),
        },
      });

      if (bytes && bytes.length > 0) {
        const base64 = uint8ArrayToBase64(bytes);
        const dataUri = `data:image/png;base64,${base64}`;
        const w = Math.round(node.width);
        const h = Math.round(node.height);
        const radius =
          "cornerRadius" in node && typeof (node as any).cornerRadius === "number"
            ? (node as any).cornerRadius
            : w <= 64
            ? Math.round(w / 2)
            : 6;

        // Clean SVG wrapper around the image for SVG preview / fallback
        const svgPreview = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip-${node.id.replace(/[^a-zA-Z0-9]/g, "")}"><rect width="${w}" height="${h}" rx="${radius}" /></clipPath></defs><image href="${dataUri}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${node.id.replace(/[^a-zA-Z0-9]/g, "")})" /></svg>`;

        return { dataUri, svgPreview };
      }
    } catch (err) {
      console.warn(`Failed to export image for node ${node.name}:`, err);
    }
    return null;
  })();

  return withTimeout(exportTask, 6000, null);
}

// Recursively traverse scene nodes
async function processNode(
  node: SceneNode,
  assets: AssetMap,
  options: { includeHidden?: boolean; maxSvgCount?: number },
  isRoot: boolean = true
): Promise<ExtractedNode | null> {
  if (!options.includeHidden && !node.visible) {
    return null;
  }

  const cleanName = sanitizeIdentifier(node.name, "kebab");
  const extracted: ExtractedNode = {
    id: node.id,
    name: node.name,
    cleanName,
    type: node.type,
    visible: node.visible,
    width: Math.round(node.width * 10) / 10,
    height: Math.round(node.height * 10) / 10,
    styles: {},
  };

  // Extract absolute positioning coordinates relative to parent
  const isAbsolute = (node as any).layoutPositioning === "ABSOLUTE";
  if (isAbsolute && node.parent && "width" in node.parent && "height" in node.parent) {
    const parentW = (node.parent as any).width || 0;
    const parentH = (node.parent as any).height || 0;
    const top = Math.round(node.y);
    const left = Math.round(node.x);
    const right = Math.round(parentW - (node.x + node.width));
    const bottom = Math.round(parentH - (node.y + node.height));

    extracted.absolutePosition = {
      top,
      left,
      right: right >= 0 ? right : undefined,
      bottom: bottom >= 0 ? bottom : undefined,
    };
  }

  const isImg = hasImageFill(node);
  const isAsset = isIconOrAsset(node, isRoot);

  // Check if this node is an icon/vector/image asset container
  if (isAsset && Object.keys(assets).length < (options.maxSvgCount || 80)) {
    const assetKey = `${cleanName}-${node.id.replace(/[^a-zA-Z0-9]/g, "")}`;
    let svgCode: string | null = null;
    let dataUri: string | undefined = undefined;

    if (!isImg) {
      // Vector icon or illustration: export real SVG
      svgCode = await exportNodeToSvg(node);
      // Fallback: if SVG export failed on container, try image export
      if (!svgCode) {
        const imgRes = await exportNodeToImage(node);
        if (imgRes) {
          svgCode = imgRes.svgPreview;
          dataUri = imgRes.dataUri;
        }
      }
    } else {
      // Real image / photo / avatar: export crisp PNG & base64 dataUri
      const imgRes = await exportNodeToImage(node);
      if (imgRes) {
        svgCode = imgRes.svgPreview;
        dataUri = imgRes.dataUri;
      } else {
        const radius = Math.round(node.width <= 64 ? node.width / 2 : 6);
        svgCode = `<svg width="${Math.round(node.width)}" height="${Math.round(node.height)}" viewBox="0 0 ${Math.round(node.width)} ${Math.round(node.height)}" fill="none"><rect width="100%" height="100%" rx="${radius}" fill="#E2E8F0"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="600" fill="#64748B">IMAGE</text></svg>`;
      }
    }

    if (svgCode) {
      assets[assetKey] = {
        name: node.name,
        type: isImg || dataUri ? "image" : "vector",
        width: Math.round(node.width),
        height: Math.round(node.height),
        svg: svgCode,
        dataUri,
      };
      extracted.assetKey = assetKey;
      if (isImg || dataUri) {
        extracted.styles.backgroundColor = `[Image Asset: ${node.name}]`;
      }
      return extracted;
    }
  }

  // Fills (background & color - skip TEXT nodes since their fills represent font color)
  if (node.type !== "TEXT" && "fills" in node && Array.isArray(node.fills) && node.fills.length > 0) {
    const visibleFills = (node.fills as ReadonlyArray<Paint>).filter((f) => f.visible !== false);
    for (const fill of visibleFills) {
      if (fill.type === "SOLID") {
        extracted.styles.backgroundColor = paintToColorString(fill);
        break;
      } else if (
        fill.type === "GRADIENT_LINEAR" ||
        fill.type === "GRADIENT_RADIAL"
      ) {
        extracted.styles.gradient = gradientToCss(fill);
        break;
      } else if (fill.type === "IMAGE") {
        extracted.styles.backgroundColor = "[Image fill]";
        break;
      }
    }
  }

  // Strokes (borders)
  if (
    "strokes" in node &&
    Array.isArray(node.strokes) &&
    node.strokes.length > 0 &&
    "strokeWeight" in node &&
    typeof node.strokeWeight === "number" &&
    node.strokeWeight > 0
  ) {
    const visibleStrokes = node.strokes.filter((s) => s.visible !== false);
    if (visibleStrokes.length > 0 && visibleStrokes[0].type === "SOLID") {
      const strokeColor = paintToColorString(visibleStrokes[0]);
      extracted.styles.border = `${node.strokeWeight}px solid ${strokeColor}`;
    }
  }

  // Corner radius
  if ("cornerRadius" in node) {
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      extracted.styles.borderRadius = node.cornerRadius;
    } else if (typeof node.cornerRadius === "symbol") {
      // Mixed corner radius
      const tl = (node as any).topLeftRadius || 0;
      const tr = (node as any).topRightRadius || 0;
      const br = (node as any).bottomRightRadius || 0;
      const bl = (node as any).bottomLeftRadius || 0;
      extracted.styles.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
    }
  }

  // Effects (shadows, blurs)
  if ("effects" in node && Array.isArray(node.effects)) {
    const shadows: string[] = [];
    for (const effect of node.effects) {
      if (effect.visible !== false && effect.type === "DROP_SHADOW") {
        const c = effect.color;
        const color = `rgba(${Math.round(c.r * 255)}, ${Math.round(
          c.g * 255
        )}, ${Math.round(c.b * 255)}, ${Math.round(c.a * 100) / 100})`;
        shadows.push(
          `${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${
            effect.spread || 0
          }px ${color}`
        );
      }
    }
    if (shadows.length > 0) {
      extracted.styles.boxShadow = shadows.join(", ");
    }
  }

  // Opacity
  if ("opacity" in node && typeof node.opacity === "number" && node.opacity < 1) {
    extracted.styles.opacity = Math.round(node.opacity * 100) / 100;
  }

  // Layout & AutoLayout properties
  if ("layoutMode" in node) {
    const frame = node as FrameNode;
    let mode: "NONE" | "ROW" | "COLUMN" = "NONE";
    if (frame.layoutMode === "HORIZONTAL") mode = "ROW";
    if (frame.layoutMode === "VERTICAL") mode = "COLUMN";

    const isWrap = (frame as any).layoutWrap === "WRAP";

    let justifyContent = "flex-start";
    if (frame.primaryAxisAlignment === "CENTER") justifyContent = "center";
    if (frame.primaryAxisAlignment === "MAX") justifyContent = "flex-end";
    if (frame.primaryAxisAlignment === "SPACE_BETWEEN")
      justifyContent = "space-between";

    let alignItems = "flex-start";
    if (frame.counterAxisAlignment === "CENTER") alignItems = "center";
    if (frame.counterAxisAlignment === "MAX") alignItems = "flex-end";
    if (frame.counterAxisAlignment === "BASELINE") alignItems = "baseline";

    extracted.layout = {
      mode,
      wrap: isWrap,
      gap: frame.itemSpacing || 0,
      padding: {
        top: frame.paddingTop || 0,
        right: frame.paddingRight || 0,
        bottom: frame.paddingBottom || 0,
        left: frame.paddingLeft || 0,
      },
      justifyContent,
      alignItems,
      horizontalSizing: frame.layoutSizingHorizontal || "FIXED",
      verticalSizing: frame.layoutSizingVertical || "FIXED",
      isAbsolute: (node as any).layoutPositioning === "ABSOLUTE",
    };

    if (frame.clipsContent) {
      extracted.styles.overflow = "hidden";
    }
  }

  // Typography for TEXT nodes
  if (node.type === "TEXT") {
    const textNode = node as TextNode;
    const segments: ExtractedTextSegment[] = [];

    try {
      if (typeof textNode.getStyledTextSegments === "function") {
        const rawSegments = textNode.getStyledTextSegments([
          "fontSize",
          "fontName",
          "lineHeight",
          "letterSpacing",
          "fills",
        ]);

        for (const seg of rawSegments) {
          let segColor: string | undefined;
          if (Array.isArray(seg.fills) && seg.fills.length > 0) {
            const f = seg.fills[0];
            if (f.type === "SOLID") {
              segColor = paintToColorString(f);
            }
          }

          let segLineHeight: string | undefined;
          if (seg.lineHeight && typeof seg.lineHeight === "object") {
            if (seg.lineHeight.unit === "PIXELS") {
              segLineHeight = `${Math.round(seg.lineHeight.value)}px`;
            } else if (seg.lineHeight.unit === "PERCENT") {
              segLineHeight = `${Math.round(seg.lineHeight.value)}%`;
            }
          }

          let segLetterSpacing: string | undefined;
          if (seg.letterSpacing && typeof seg.letterSpacing === "object") {
            if (seg.letterSpacing.unit === "PIXELS") {
              segLetterSpacing = `${Math.round(seg.letterSpacing.value * 10) / 10}px`;
            } else if (seg.letterSpacing.unit === "PERCENT") {
              segLetterSpacing = `${Math.round(seg.letterSpacing.value)}%`;
            }
          }

          segments.push({
            text: seg.characters,
            fontFamily: seg.fontName.family,
            fontWeight: mapFontWeight(seg.fontName.style),
            fontSize: Math.round(seg.fontSize),
            lineHeight: segLineHeight,
            letterSpacing: segLetterSpacing,
            color: segColor,
          });
        }
      }
    } catch (err) {
      // Fallback if getStyledTextSegments fails
      const font =
        typeof textNode.fontName === "object" ? textNode.fontName : null;
      let fallbackColor: string | undefined;
      if ("fills" in textNode && Array.isArray(textNode.fills) && textNode.fills.length > 0) {
        const firstVisibleFill = (textNode.fills as ReadonlyArray<Paint>).find((f) => f.visible !== false);
        if (firstVisibleFill && firstVisibleFill.type === "SOLID") {
          fallbackColor = paintToColorString(firstVisibleFill);
        }
      }
      segments.push({
        text: textNode.characters,
        fontFamily: font ? font.family : "Inter",
        fontWeight: font ? mapFontWeight(font.style) : 400,
        fontSize:
          typeof textNode.fontSize === "number"
            ? Math.round(textNode.fontSize)
            : 16,
        color: fallbackColor,
      });
    }

    let textAlign = "left";
    if (textNode.textAlignHorizontal === "CENTER") textAlign = "center";
    if (textNode.textAlignHorizontal === "RIGHT") textAlign = "right";
    if (textNode.textAlignHorizontal === "JUSTIFIED") textAlign = "justify";

    extracted.typography = {
      characters: textNode.characters,
      segments,
      textAlign,
    };
  }

  // Recursively process children
  if ("children" in node && Array.isArray(node.children)) {
    extracted.children = [];
    for (const child of node.children) {
      const processedChild = await processNode(child, assets, options, false);
      if (processedChild) {
        extracted.children.push(processedChild);
      }
    }
  }

  return extracted;
}

// Generate AI Prompt & Hierarchical Spec
function generateAiSpec(root: ExtractedNode, assets: AssetMap): string {
  function pruneNodeForAi(node: ExtractedNode, depth = 0): any {
    const indent = "  ".repeat(depth);
    const item: any = {
      layer: node.name,
      type: node.type,
      size: `${node.width}x${node.height}`,
    };

    if (node.assetKey) {
      const asset = assets[node.assetKey];
      if (asset && asset.type === "image") {
        item.imageAssetKey = node.assetKey;
        if (asset.dataUri) {
          item.dataUri = asset.dataUri;
        }
      } else {
        item.iconAssetKey = node.assetKey;
      }
      if (node.absolutePosition) {
        item.absolutePosition = node.absolutePosition;
      }
      return item;
    }

    if (node.absolutePosition) {
      item.absolutePosition = node.absolutePosition;
    }

    if (node.layout && node.layout.mode !== "NONE") {
      item.layout = {
        direction: node.layout.mode === "ROW" ? "row" : "column",
        gap: `${node.layout.gap}px`,
        padding: `${node.layout.padding.top}px ${node.layout.padding.right}px ${node.layout.padding.bottom}px ${node.layout.padding.left}px`,
        justifyContent: node.layout.justifyContent,
        alignItems: node.layout.alignItems,
        sizing: `H:${node.layout.horizontalSizing} V:${node.layout.verticalSizing}`,
      };
    }

    if (Object.keys(node.styles).length > 0) {
      item.styles = { ...node.styles };
      if (!item.styles.border && (item.styles.borderRadius !== undefined || item.styles.backgroundColor)) {
        item.styles.border = "none";
      }
    }

    if (node.typography) {
      item.typography = {
        text: node.typography.characters,
        textAlign: node.typography.textAlign,
        segments: node.typography.segments.map((s) => ({
          font: `${s.fontFamily} ${s.fontWeight} ${s.fontSize}px`,
          lineHeight: s.lineHeight || "normal",
          color: s.color || "inherit",
          text: s.text.length > 50 ? s.text.slice(0, 47) + "..." : s.text,
        })),
      };
    }

    if (node.children && node.children.length > 0) {
      item.children = node.children.map((c) => pruneNodeForAi(c, depth + 1));
    }

    return item;
  }

  const aiTree = pruneNodeForAi(root);

  // Collect color palette across tree
  const backgroundColors = new Map<string, string[]>();
  const textColors = new Map<string, string[]>();
  const borderColors = new Map<string, string[]>();

  function collectPalette(node: ExtractedNode) {
    if (node.styles?.backgroundColor && !node.styles.backgroundColor.startsWith("[")) {
      const bg = node.styles.backgroundColor;
      const list = backgroundColors.get(bg) || [];
      if (!list.includes(node.name)) list.push(node.name);
      backgroundColors.set(bg, list);
    }
    if (node.styles?.border && node.styles.border !== "none") {
      const b = node.styles.border;
      const list = borderColors.get(b) || [];
      if (!list.includes(node.name)) list.push(node.name);
      borderColors.set(b, list);
    }
    if (node.typography?.segments) {
      for (const seg of node.typography.segments) {
        if (seg.color && seg.color !== "inherit") {
          const list = textColors.get(seg.color) || [];
          if (!list.includes(node.name)) list.push(node.name);
          textColors.set(seg.color, list);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) collectPalette(child);
    }
  }
  collectPalette(root);

  let paletteSection = "";
  if (backgroundColors.size > 0 || textColors.size > 0 || borderColors.size > 0) {
    paletteSection += "--- \n#### COLOR PALETTE (EXACT VALUES - USE DIRECTLY, DO NOT GUESS TOKENS):\n";
    if (backgroundColors.size > 0) {
      paletteSection += "- **Background Colors**:\n";
      for (const [color, layers] of backgroundColors.entries()) {
        paletteSection += `  - \`${color}\` -> Used by: ${layers.slice(0, 4).join(", ")}\n`;
      }
    }
    if (textColors.size > 0) {
      paletteSection += "- **Text Colors**:\n";
      for (const [color, layers] of textColors.entries()) {
        const isWhite = color.toUpperCase() === "#FFFFFF" || color.toUpperCase() === "#FFF";
        const note = isWhite ? " (WHITE TEXT - Container MUST have solid background applied!)" : "";
        paletteSection += `  - \`${color}\`${note} -> Used by: ${layers.slice(0, 4).join(", ")}\n`;
      }
    }
    if (borderColors.size > 0) {
      paletteSection += "- **Borders**:\n";
      for (const [border, layers] of borderColors.entries()) {
        paletteSection += `  - \`${border}\` -> Used by: ${layers.slice(0, 4).join(", ")}\n`;
      }
    }
  }

  const assetList: { [key: string]: any } = {};
  for (const [key, val] of Object.entries(assets)) {
    if (val.type === "image") {
      assetList[key] = {
        type: "image",
        name: val.name,
        width: val.width,
        height: val.height,
        dataUri: val.dataUri,
        renderAs: val.dataUri
          ? `<Image source={{ uri: "${val.dataUri}" }} style={{ width: ${val.width}, height: ${val.height} }} />`
          : `<Image source={{ uri: "placeholder" }} style={{ width: ${val.width}, height: ${val.height} }} />`,
      };
    } else {
      assetList[key] = val.svg;
    }
  }

  const totalAssetsCount = Object.keys(assets).length;
  const aiPrompt = `### FIGMA DESIGN SPECIFICATION (PIXEL-PERFECT IMPLEMENTATION)
Use this exact hierarchical spec and assets to build or update the component/screen.
DO NOT guess spacing, font sizes, or colors. Use the exact values below.
For all icons and assets, render the provided raw SVG code or image data URI directly.

---
### ⚠️ CRITICAL COLOR & BUTTON RULES (DO NOT IGNORE):
1. **EXACT BACKGROUND COLORS (MANDATORY)**:
   - For every element with \`styles.backgroundColor\` (buttons, badges, cards), you MUST apply that exact hex color directly (e.g. \`backgroundColor: "#695138"\` or \`"#3E92FF"\`).
   - DO NOT guess or invent theme token names (e.g. \`theme.colors.brownDark\` or \`theme.colors.brandBlue\`) that may evaluate to \`undefined\` at runtime! If a verified theme token does not exist, use the raw hex string directly.
   - NEVER let buttons or containers with dark backgrounds default to white or transparent, as this makes white text (\`#FFFFFF\`) completely invisible!
2. **BUTTONS & BORDERS**:
   - If \`styles.border\` is \`"none"\` or omitted, do NOT add a border.
   - DO NOT map solid colored buttons to generic library variants (like \`variant="white"\` or \`variant="outlined"\`) that override the specified background color.
3. **TEXT CONTRAST & VISIBILITY**:
   - Ensure text color (\`typography.segments[].color\`) is applied. If text is white (\`#FFFFFF\`), ensure its parent container has its solid background color applied.

${paletteSection}
---
#### 1. SCREEN HIERARCHY & STYLES (JSON Tree)
\`\`\`json
${JSON.stringify(aiTree, null, 2)}
\`\`\`

---
#### 2. EXTRACTED SVG ICONS & ASSETS (${totalAssetsCount} found)
${
  totalAssetsCount === 0
    ? "_No vector icons or image assets found in selection._"
    : `\`\`\`json\n${JSON.stringify(assetList, null, 2)}\n\`\`\``
}
`;

  return aiPrompt;
}

// Generate Clean CSS Stylesheet
function generateCss(root: ExtractedNode): string {
  const cssRules: string[] = [];
  const usedClasses = new Set<string>();

  function getUniqueClass(name: string): string {
    let base = sanitizeIdentifier(name, "kebab");
    let candidate = base;
    let counter = 2;
    while (usedClasses.has(candidate)) {
      candidate = `${base}-${counter}`;
      counter++;
    }
    usedClasses.add(candidate);
    return candidate;
  }

  function traverse(node: ExtractedNode, path: string[] = []) {
    const currentPath = [...path, node.name];
    const className = getUniqueClass(node.name);

    const rules: string[] = [];

    // Layout
    if (node.layout) {
      if (node.layout.mode !== "NONE") {
        rules.push("  display: flex;");
        rules.push(
          `  flex-direction: ${
            node.layout.mode === "ROW" ? "row" : "column"
          };`
        );
        if (node.layout.gap > 0) {
          rules.push(`  gap: ${node.layout.gap}px;`);
        }
        const p = node.layout.padding;
        if (p.top > 0 || p.right > 0 || p.bottom > 0 || p.left > 0) {
          rules.push(
            `  padding: ${p.top}px ${p.right}px ${p.bottom}px ${p.left}px;`
          );
        }
        if (node.layout.justifyContent !== "flex-start") {
          rules.push(`  justify-content: ${node.layout.justifyContent};`);
        }
        if (node.layout.alignItems !== "flex-start") {
          rules.push(`  align-items: ${node.layout.alignItems};`);
        }
        if (node.layout.wrap) {
          rules.push("  flex-wrap: wrap;");
        }
      }

      if (node.layout?.isAbsolute || node.absolutePosition) {
        rules.push("  position: absolute;");
        if (node.absolutePosition) {
          if (typeof node.absolutePosition.top === "number") {
            rules.push(`  top: ${node.absolutePosition.top}px;`);
          }
          if (
            typeof node.absolutePosition.right === "number" &&
            typeof node.absolutePosition.left === "number" &&
            node.absolutePosition.right < node.absolutePosition.left
          ) {
            rules.push(`  right: ${node.absolutePosition.right}px;`);
          } else if (typeof node.absolutePosition.left === "number") {
            rules.push(`  left: ${node.absolutePosition.left}px;`);
          }
          if (
            typeof node.absolutePosition.bottom === "number" &&
            typeof node.absolutePosition.top === "number" &&
            node.absolutePosition.bottom < node.absolutePosition.top
          ) {
            rules.push(`  bottom: ${node.absolutePosition.bottom}px;`);
          }
        }
      }
    }

    // Dimensions
    if (node.layout?.horizontalSizing === "FILL") {
      rules.push("  width: 100%;");
    } else if (node.layout?.horizontalSizing === "FIXED" || !node.layout) {
      rules.push(`  width: ${node.width}px;`);
    }

    if (node.layout?.verticalSizing === "FILL") {
      rules.push("  height: 100%;");
    } else if (
      (node.layout?.verticalSizing === "FIXED" || !node.layout) &&
      node.type !== "TEXT"
    ) {
      rules.push(`  height: ${node.height}px;`);
    }

    // Styles
    if (node.styles.backgroundColor && !node.styles.backgroundColor.startsWith("[")) {
      rules.push(`  background-color: ${node.styles.backgroundColor};`);
    }
    if (node.styles.gradient) {
      rules.push(`  background: ${node.styles.gradient};`);
    }
    if (node.styles.borderRadius) {
      rules.push(
        `  border-radius: ${
          typeof node.styles.borderRadius === "number"
            ? `${node.styles.borderRadius}px`
            : node.styles.borderRadius
        };`
      );
    }
    if (node.styles.border) {
      rules.push(`  border: ${node.styles.border};`);
    }
    if (node.styles.boxShadow) {
      rules.push(`  box-shadow: ${node.styles.boxShadow};`);
    }
    if (node.styles.opacity !== undefined) {
      rules.push(`  opacity: ${node.styles.opacity};`);
    }
    if (node.styles.overflow) {
      rules.push(`  overflow: ${node.styles.overflow};`);
    }

    // Typography
    if (node.typography && node.typography.segments.length > 0) {
      const seg = node.typography.segments[0];
      rules.push(`  font-family: '${seg.fontFamily}', sans-serif;`);
      rules.push(`  font-size: ${seg.fontSize}px;`);
      rules.push(`  font-weight: ${seg.fontWeight};`);
      if (seg.lineHeight) {
        rules.push(`  line-height: ${seg.lineHeight};`);
      }
      if (seg.letterSpacing) {
        rules.push(`  letter-spacing: ${seg.letterSpacing};`);
      }
      if (seg.color) {
        rules.push(`  color: ${seg.color};`);
      }
      if (node.typography.textAlign && node.typography.textAlign !== "left") {
        rules.push(`  text-align: ${node.typography.textAlign};`);
      }
    }

    if (rules.length > 0) {
      cssRules.push(`/* ${currentPath.join(" > ")} */`);
      cssRules.push(`.${className} {\n${rules.join("\n")}\n}`);
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child, currentPath);
      }
    }
  }

  traverse(root);
  return cssRules.join("\n\n");
}

// Generate React Native StyleSheet
function generateReactNative(root: ExtractedNode): string {
  const stylesObj: any = {};
  const usedKeys = new Set<string>();

  function getUniqueKey(name: string): string {
    let base = sanitizeIdentifier(name, "camel");
    let candidate = base;
    let counter = 2;
    while (usedKeys.has(candidate)) {
      candidate = `${base}${counter}`;
      counter++;
    }
    usedKeys.add(candidate);
    return candidate;
  }

  function traverse(node: ExtractedNode) {
    const key = getUniqueKey(node.name);
    const style: any = {};

    if (node.layout) {
      if (node.layout.mode !== "NONE") {
        style.flexDirection = node.layout.mode === "ROW" ? "row" : "column";
        if (node.layout.gap > 0) style.gap = node.layout.gap;
        const p = node.layout.padding;
        if (p.top > 0) style.paddingTop = p.top;
        if (p.right > 0) style.paddingRight = p.right;
        if (p.bottom > 0) style.paddingBottom = p.bottom;
        if (p.left > 0) style.paddingLeft = p.left;
        if (node.layout.justifyContent !== "flex-start") {
          style.justifyContent = node.layout.justifyContent;
        }
        if (node.layout.alignItems !== "flex-start") {
          style.alignItems = node.layout.alignItems;
        }
        if (node.layout.wrap) {
          style.flexWrap = "wrap";
        }
      }

      if (node.layout.horizontalSizing === "FILL") {
        style.alignSelf = "stretch";
      } else if (node.layout.horizontalSizing === "FIXED" || !node.layout) {
        style.width = node.width;
      }

      if (node.layout.verticalSizing === "FILL") {
        style.flex = 1;
      } else if (
        (node.layout.verticalSizing === "FIXED" || !node.layout) &&
        node.type !== "TEXT"
      ) {
        style.height = node.height;
      }

      if (node.layout?.isAbsolute || node.absolutePosition) {
        style.position = "absolute";
        if (node.absolutePosition) {
          if (typeof node.absolutePosition.top === "number") {
            style.top = node.absolutePosition.top;
          }
          if (
            typeof node.absolutePosition.right === "number" &&
            typeof node.absolutePosition.left === "number" &&
            node.absolutePosition.right < node.absolutePosition.left
          ) {
            style.right = node.absolutePosition.right;
          } else if (typeof node.absolutePosition.left === "number") {
            style.left = node.absolutePosition.left;
          }
          if (
            typeof node.absolutePosition.bottom === "number" &&
            typeof node.absolutePosition.top === "number" &&
            node.absolutePosition.bottom < node.absolutePosition.top
          ) {
            style.bottom = node.absolutePosition.bottom;
          }
        }
      }
    }

    if (node.styles.backgroundColor && !node.styles.backgroundColor.startsWith("[")) {
      style.backgroundColor = node.styles.backgroundColor;
    }
    if (node.styles.borderRadius) {
      if (typeof node.styles.borderRadius === "number") {
        style.borderRadius = node.styles.borderRadius;
      }
    }
    if (node.styles.opacity !== undefined) {
      style.opacity = node.styles.opacity;
    }

    if (node.typography && node.typography.segments.length > 0) {
      const seg = node.typography.segments[0];
      style.fontFamily = seg.fontFamily;
      style.fontSize = seg.fontSize;
      style.fontWeight = String(seg.fontWeight);
      if (seg.color) style.color = seg.color;
      if (seg.lineHeight && seg.lineHeight.endsWith("px")) {
        style.lineHeight = parseInt(seg.lineHeight, 10);
      }
      if (node.typography.textAlign && node.typography.textAlign !== "left") {
        style.textAlign = node.typography.textAlign;
      }
    }

    if (Object.keys(style).length > 0) {
      stylesObj[key] = style;
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(root);

  return `import { StyleSheet } from 'react-native';\n\nexport const styles = StyleSheet.create(${JSON.stringify(
    stylesObj,
    null,
    2
  )});\n`;
}

// Main execution function when selection changes or extract is requested
async function extractCurrentSelection(options: any = {}) {
  try {
    const selection = figma.currentPage.selection;
    if (!selection || selection.length === 0) {
      figma.ui.postMessage({
        type: "empty-selection",
        message: "Please select a Frame, Screen, or Component on the canvas.",
      });
      return;
    }

    figma.ui.postMessage({
      type: "loading",
      message: `Scanning ${selection.length} selected layer(s)...`,
    });

    const assets: AssetMap = {};
    const extractedNodes: ExtractedNode[] = [];

    for (const node of selection) {
      const extracted = await processNode(
        node,
        assets,
        {
          includeHidden: options.includeHidden || false,
          maxSvgCount: options.maxSvgCount || 60,
        },
        true
      );
      if (extracted) {
        extractedNodes.push(extracted);
      }
    }

    if (extractedNodes.length === 0) {
      figma.ui.postMessage({
        type: "empty-selection",
        message: "No visible layers found in selection.",
      });
      return;
    }

    const root = extractedNodes[0];
    const aiSpec = generateAiSpec(root, assets);
    const css = generateCss(root);
    const reactNative = generateReactNative(root);

    figma.ui.postMessage({
      type: "extraction-complete",
      data: {
        rootName: root.name,
        nodeType: root.type,
        width: root.width,
        height: root.height,
        totalAssets: Object.keys(assets).length,
        aiSpec,
        css,
        reactNative,
        assets,
      },
    });
  } catch (err: any) {
    console.error("Extraction error:", err);
    figma.ui.postMessage({
      type: "empty-selection",
      message: `Extraction error: ${err?.message || String(err)}`,
    });
  }
}

// Initial run on startup
extractCurrentSelection();
