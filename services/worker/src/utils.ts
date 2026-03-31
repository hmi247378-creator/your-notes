/**
 * Utility functions for notes processing
 */

export function toPlainText(md: string): string {
  if (!md) return '';
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/[#>*_~\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateId(): string {
  return crypto.randomUUID();
}

/** JSON API standard response */
export function sendData(data: any) {
  return { data };
}

export function sendError(message: string, code: number = 400, details?: any) {
  return { error: { message, code, details } };
}
