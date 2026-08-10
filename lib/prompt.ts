import type { ColorSwatch } from "./extract";

export type PromptMode = "both" | "colors" | "images";

export function buildMasterPrompt(
  siteUrl: string,
  siteTitle: string,
  colors: ColorSwatch[],
  imageUrls: string[],
  imagesAreAvif: boolean,
  mode: PromptMode = "both"
): string {
  const includeColors = mode !== "images";
  const includeImages = mode !== "colors";

  const colorLines = colors.map((c) => `- ${c.hex} (${c.role})`).join("\n");
  const imageLines = imageUrls.map((u) => `- ${u}`).join("\n");

  const sections: string[] = [];
  if (includeColors) {
    sections.push(
      `Brand colors (use as CSS variables / Tailwind theme colors, matching the role each was extracted for):\n${colorLines || "- (no colors extracted, inspect the site manually)"}`
    );
  }
  if (includeImages) {
    sections.push(
      `Brand images (logo/icons/photography${imagesAreAvif ? ", already optimized to AVIF" : ""}):\n${imageLines || "- (no images selected)"}`
    );
  }

  const instructions: string[] = [];
  if (includeColors) {
    instructions.push(
      "Replace the template's primary/secondary/accent colors with the palette above, preserving WCAG AA contrast for text on backgrounds."
    );
  }
  if (includeImages) {
    instructions.push(
      "Swap the template's placeholder logo/hero images with the extracted images where roles match (logo -> header/nav, others -> hero/gallery sections)."
    );
  }
  instructions.push(
    "Keep the template's existing layout, spacing, and component structure -- only update colors and imagery."
  );
  if (includeColors) {
    instructions.push(
      "If any extracted color fails contrast checks, adjust lightness slightly while preserving hue."
    );
  }

  const what = includeColors && includeImages ? "brand identity" : includeColors ? "brand colors" : "brand images";

  return `Apply the ${what} extracted from "${siteTitle}" (${siteUrl}) to my template.

${sections.join("\n\n")}

Instructions:
${instructions.map((line, i) => `${i + 1}. ${line}`).join("\n")}`;
}
