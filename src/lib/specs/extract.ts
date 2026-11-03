import { getDocumentProxy } from "unpdf";

type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };

/**
 * Extracts each PDF page as plain text, one string per page, keeping line breaks.
 * Items on the same baseline are joined left to right; a wide horizontal gap becomes
 * three spaces so footers like "JOINT SEALANTS    07 92 00 - 3" stay splittable.
 */
export async function extractPages(data: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(data);
  const pages: string[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[]).filter((i) => typeof i.str === "string" && i.str.length > 0);

    // Group items into lines by baseline (y), top of page first.
    const lines: { y: number; parts: { x: number; end: number; s: string }[] }[] = [];
    for (const item of items) {
      const x = item.transform[4];
      const y = item.transform[5];
      let line = lines.find((l) => Math.abs(l.y - y) < 2.5);
      if (!line) {
        line = { y, parts: [] };
        lines.push(line);
      }
      line.parts.push({ x, end: x + item.width, s: item.str });
    }
    lines.sort((a, b) => b.y - a.y);

    const text = lines
      .map((l) => {
        l.parts.sort((a, b) => a.x - b.x);
        let out = "";
        let prevEnd: number | null = null;
        for (const p of l.parts) {
          if (prevEnd !== null) {
            const gap = p.x - prevEnd;
            if (gap > 18) out += "   ";
            else if (gap > 1.5 && !out.endsWith(" ") && !p.s.startsWith(" ")) out += " ";
          }
          out += p.s;
          prevEnd = p.end;
        }
        return out.replace(/\s+$/, "");
      })
      .filter((l) => l.trim().length > 0)
      .join("\n");

    pages.push(text);
    page.cleanup();
  }

  await pdf.cleanup?.();
  return pages;
}
