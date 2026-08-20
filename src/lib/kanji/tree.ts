export type MindNode = { name: string; character?: string; children?: MindNode[] };

export function mindTree(characters: { character: string; branch?: string }[]): MindNode {
  const grouped = new Map<string, string[]>();
  for (const item of characters) {
    const branch = item.branch || "Other";
    grouped.set(branch, [...(grouped.get(branch) ?? []), item.character]);
  }
  return {
    name: "漢",
    children: [...grouped.entries()].map(([name, chars]) => ({
      name,
      children: chars.map((character) => ({ name: character, character })),
    })),
  };
}
