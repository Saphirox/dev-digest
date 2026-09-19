/** A skill body shown as the file an exported skill would be: `<name>.md`. */
export function markdownFileName(name: string): string {
  const slug = name.trim().replace(/\s+/g, "-");
  return `${slug || "skill"}.md`;
}
