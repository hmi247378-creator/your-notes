export function slugifyTagName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'tag';
  const ascii = trimmed
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\u4e00-\u9fa5]/g, '');
  return ascii || 'tag';
}

export function buildTagPath(parentPath: string | null, name: string): string {
  const slug = slugifyTagName(name);
  return parentPath ? `${parentPath}.${slug}` : slug;
}

