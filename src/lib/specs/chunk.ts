// Splits extracted spec pages into searchable chunks.
// Each chunk keeps its CSI section number, section title, and the PDF page it starts on,
// so every answer can cite "Section 07 92 00, page 3 (PDF p. 481)".

export type Chunk = {
  section: string | null; // "07 92 00", "01 00 00.01", "TOC", or null if unknown
  title: string | null; // "JOINT SEALANTS"
  page: number; // PDF page where the chunk starts (1-based)
  page_end: number; // PDF page where it ends
  section_page: number | null; // page number printed in the section footer
  text: string;
};

// Section numbers, including variants like "01 50 00.01", "01 50 00.1" and "01 50 00 01".
const SEC = String.raw`\d{2} \d{2} \d{2}(?:[. ]\d{1,2})?`;

/** "01 50 00 01" / "01 50 00.1" → "01 50 00.01" so header and footer agree. */
function canonSection(raw: string): string {
  const m = raw.match(/^(\d{2} \d{2} \d{2})(?:[. ](\d{1,2}))?$/);
  if (!m) return raw;
  return m[2] ? `${m[1]}.${m[2].padStart(2, "0")}` : m[1];
}
const SECTION_HEADER = new RegExp(String.raw`^\s*(?:SECTION|DOCUMENT)\s+(${SEC})\s*[-–—]\s*(.+?)\s*$`);
const FOOTER_NUM = new RegExp(String.raw`(${SEC})\s*[-–—]\s*(\d+)\s*$`);
const TOC_FOOTER = /TOC\s*[-–—]\s*(\d+)\s*$/;
const END_OF_SECTION = new RegExp(String.raw`^\s*END OF (?:SECTION|DOCUMENT)\b`);
const ARTICLE = /^\s*(?:PART\s+\d+\b|\d{1,2}\.\d{1,2}\s+[A-Z][A-Z])/;
const PARAGRAPH = /^\s*[A-Z]\.\s+\S/;
const BLANK_PAGE = /THIS PAGE INTENTIONALLY LEFT BLANK/i;

const MIN_WORDS = 500;
const MAX_WORDS = 1000;

type PageLine = { text: string; page: number };
type PageInfo = { section: string | null; sectionPage: number | null; footerTitle: string | null; body: string[] };

const words = (s: string) => (s.match(/\S+/g) ?? []).length;
const isCapsLine = (s: string) => !/[a-z]/.test(s) && /[A-Z]/.test(s);

/** Lines that repeat at the top of many pages (project name, issue date) are running headers. */
function findRunningHeaders(pages: string[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const lines of pages) {
    for (const l of new Set(lines.slice(0, 4).map((x) => x.trim()))) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const threshold = Math.max(3, pages.length * 0.3);
  return new Set([...counts].filter(([, c]) => c >= threshold).map(([l]) => l));
}

function readPage(lines: string[], headers: Set<string>): PageInfo {
  const body = [...lines];
  while (body.length && headers.has(body[0].trim())) body.shift();

  // The footer is in the last three lines: "TITLE   07 92 00 - 3", sometimes wrapped.
  let section: string | null = null;
  let sectionPage: number | null = null;
  let footerTitle: string | null = null;
  const tail = body.slice(-3);
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i].match(FOOTER_NUM);
    const t = tail[i].match(TOC_FOOTER);
    if (m || t) {
      const cut = body.length - tail.length + i;
      // Include a wrapped title line just above the number line.
      let start = cut;
      while (start > 0 && body.length - start < 3 && isCapsLine(body[start - 1]) && !ARTICLE.test(body[start - 1]) && !END_OF_SECTION.test(body[start - 1]) && !SECTION_HEADER.test(body[start - 1])) start--;
      const titleText = body
        .slice(start, cut + 1)
        .join(" ")
        .replace(FOOTER_NUM, "")
        .replace(TOC_FOOTER, "")
        .replace(/\s+/g, " ")
        .trim();
      if (m) {
        section = canonSection(m[1]);
        sectionPage = Number(m[2]);
      } else {
        section = "TOC";
        sectionPage = Number(t![1]);
      }
      footerTitle = titleText || null;
      body.splice(start, body.length - start);
      break;
    }
  }
  return { section, sectionPage, footerTitle, body };
}

/** Packs article blocks into chunks of roughly MIN_WORDS–MAX_WORDS. */
function packBlocks(blocks: PageLine[][]): PageLine[][] {
  const out: PageLine[][] = [];
  let cur: PageLine[] = [];
  let curWords = 0;
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
    curWords = 0;
  };
  for (const block of blocks) {
    const w = block.reduce((n, l) => n + words(l.text), 0);
    if (w > MAX_WORDS) {
      flush();
      // Split an oversized article on line boundaries.
      let part: PageLine[] = [];
      let pw = 0;
      for (const l of block) {
        // Break before a lettered paragraph ("B. ...") once the part is big enough,
        // or anywhere if it would overflow.
        const lw = words(l.text);
        if (part.length && ((pw >= MIN_WORDS && PARAGRAPH.test(l.text)) || pw + lw > MAX_WORDS)) {
          out.push(part);
          part = [];
          pw = 0;
        }
        part.push(l);
        pw += lw;
      }
      if (part.length) {
        cur = part;
        curWords = pw;
      }
      continue;
    }
    if (curWords + w > MAX_WORDS) flush();
    cur.push(...block);
    curWords += w;
    if (curWords >= MIN_WORDS) flush();
  }
  flush();
  return out;
}

export function chunkSpecPages(pageTexts: string[]): Chunk[] {
  const split = pageTexts.map((p) => p.split("\n"));
  const headers = findRunningHeaders(split);

  // 1. Read each page, then assign each line to a section.
  type Section = { section: string | null; title: string | null; lines: PageLine[]; pageNums: Map<number, number | null> };
  const sections: Section[] = [];
  let current: Section | null = null;
  const startSection = (section: string | null, title: string | null) => {
    current = { section, title, lines: [], pageNums: new Map() };
    sections.push(current);
    return current;
  };

  split.forEach((lines, idx) => {
    const pageNo = idx + 1;
    const info = readPage(lines, headers);
    if (info.body.every((l) => !l.trim() || BLANK_PAGE.test(l))) return;

    for (const line of info.body) {
      const h = line.match(SECTION_HEADER);
      if (h) {
        startSection(canonSection(h[1]), h[2].trim());
        continue;
      }
      let sec: Section = current ?? startSection(info.section, info.footerTitle);
      // Footer says we're in a different section than the open one (e.g. header missed).
      if (info.section && sec.section !== info.section) sec = startSection(info.section, info.footerTitle);
      sec.lines.push({ text: line, page: pageNo });
      if (!sec.pageNums.has(pageNo)) sec.pageNums.set(pageNo, info.section === sec.section ? info.sectionPage : null);
      if (END_OF_SECTION.test(line)) current = null;
    }
  });

  // 2. Within each section, split on PART / article headings and pack into chunks.
  const chunks: Chunk[] = [];
  for (const s of sections) {
    if (!s.lines.length) continue;
    if (s.section === "TOC") s.title = "TABLE OF CONTENTS";
    const blocks: PageLine[][] = [];
    for (const l of s.lines) {
      if (!blocks.length || ARTICLE.test(l.text)) blocks.push([]);
      blocks[blocks.length - 1].push(l);
    }
    for (const group of packBlocks(blocks)) {
      const text = group.map((l) => l.text).join("\n").trim();
      if (!text) continue;
      const page = group[0].page;
      chunks.push({
        section: s.section,
        title: s.title,
        page,
        page_end: group[group.length - 1].page,
        section_page: s.pageNums.get(page) ?? null,
        text,
      });
    }
  }
  return chunks;
}

/** Text sent to the embedding model: section context first, then the chunk. */
export function embeddingInput(c: Pick<Chunk, "section" | "title" | "text">): string {
  const head = [c.section && c.section !== "TOC" ? `Section ${c.section}` : null, c.title].filter(Boolean).join(" ");
  return head ? `${head}\n${c.text}` : c.text;
}

/** "07 92 00", "079200", "07-92-00", "07 92 00.01" → canonical "07 92 00"; otherwise null. */
export function normalizeSectionQuery(q: string): string | null {
  const m = q.trim().match(/^(?:section\s+)?(\d{2})[\s.-]?(\d{2})[\s.-]?(\d{2})(\.\d{2})?$/i);
  return m ? `${m[1]} ${m[2]} ${m[3]}${m[4] ?? ""}` : null;
}
