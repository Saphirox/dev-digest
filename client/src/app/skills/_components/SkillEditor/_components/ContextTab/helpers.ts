/** How the attached paths read to an agent: a heading and one `- <path>` line each. */
export function serializeAs(paths: string[]): string {
  return ["## Project specifications", ...paths.map((p) => `- ${p}`)].join("\n");
}
