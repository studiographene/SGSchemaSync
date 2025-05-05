// src/helpers/generator-helpers.ts

// Helper to generate a TS identifier (e.g., for function names, types)
export function toTsIdentifier(str: string): string {
  if (!str) return "_"; // Handle empty or null strings
  // Remove leading/trailing non-alphanumeric, replace separators with underscores
  const cleaned = str.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").replace(/[^a-zA-Z0-9_]+/g, "_");
  // Ensure it starts with a letter or underscore if the first char was numeric or if empty after cleaning
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `_${cleaned}`;
  }
  return cleaned;
}

// Helper to generate a PascalCase type name
export function toPascalCase(str: string): string {
  if (!str) return "Type"; // Handle empty or null strings
  // Correctly handle splitting and mapping
  return str
    .split(/[^a-zA-Z0-9]/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ""))
    .join("");
}

// Helper for path-based base name (Revised to include parameter info)
export function getPathBasedBaseName(path: string): string {
  // Remove common prefixes /api/, /v1/, or just leading slash
  const cleanedPath = path.replace(/^\/(api|v\d+)\/|^\//, "");

  // Split segments and handle parameters
  const segments = cleanedPath.split("/").map((seg) => {
    if (seg.startsWith("{") && seg.endsWith("}")) {
      // Convert {paramName} to ByParamName
      const paramName = seg.slice(1, -1);
      return `By${toPascalCase(paramName)}`;
    } else {
      // Convert normal segment to PascalCase
      return toPascalCase(seg);
    }
  });

  const joined = segments.join("");

  // Handle cases where the path might become empty after processing
  if (!joined) return "RootOperation"; // Fallback

  return joined;
}

// --- Banner Formatting Helpers ---
const BANNER_WIDTH = 74;

export function createBanner(text: string, char: string = "-"): string {
  const paddingTotal = BANNER_WIDTH - text.length - 2; // -2 for spaces around text
  if (paddingTotal < 0) {
    // Text too long, simple banner
    const line = char.repeat(BANNER_WIDTH);
    return `/*${line}*/\n/* ${text} */\n/*${line}*/`;
  }
  const paddingLeft = Math.floor(paddingTotal / 2);
  const paddingRight = paddingTotal - paddingLeft; // Use this instead of ceil for exact width
  const line = char.repeat(BANNER_WIDTH);
  const paddedText = `${char.repeat(paddingLeft)} ${text} ${char.repeat(paddingRight)}`;
  return `/*${line}*/\n/*${paddedText}*/\n/*${line}*/`;
}

export function createRouteBanner(method: string, path: string, char: string = "-"): string {
  const routeText = `${method.toUpperCase()} ${path}`;
  // Simple banner, no complex padding needed based on user example format
  const sideWidth = Math.floor((BANNER_WIDTH - routeText.length - 2) / 2);
  const dashes = char.repeat(sideWidth > 0 ? sideWidth : 1);
  return `/* ${dashes} ${routeText} ${dashes} */`;
}
// --- End Banner Formatting Helpers ---
