// Shared bullet-list text format for EOD report fields: a main bullet is
// "• text", a sub-bullet (one level deep) is "  ◦ text". Both the report
// form (typing) and the Teams card builder (posting) parse/build against
// this so the two never drift out of sync.

export const BULLET = "• ";
export const SUB_BULLET = "  ◦ ";

export interface BulletLine {
  level: 0 | 1;
  text: string;
}

export function parseBulletLine(rawLine: string): BulletLine {
  if (rawLine.startsWith(SUB_BULLET)) return { level: 1, text: rawLine.slice(SUB_BULLET.length) };
  if (rawLine.startsWith(BULLET)) return { level: 0, text: rawLine.slice(BULLET.length) };
  // Fallback for text that predates this format, or was pasted in from
  // elsewhere: treat indented/dashed lines as sub-bullets.
  const leadingWs = /^\s+/.exec(rawLine)?.[0] ?? "";
  const text = rawLine.slice(leadingWs.length).replace(/^[-*•◦]\s*/, "");
  return { level: leadingWs.length > 0 ? 1 : 0, text };
}

export function parseBulletLines(raw: string): BulletLine[] {
  return raw
    .split(/\r?\n/)
    .map(parseBulletLine)
    .filter((line) => line.text.trim() !== "");
}

export function sanitizeBulletText(raw: string): string {
  return parseBulletLines(raw)
    .map(({ level, text }) => (level === 1 ? SUB_BULLET : BULLET) + text.trim())
    .join("\n");
}
