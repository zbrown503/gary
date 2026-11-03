import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embed, toPgVector } from "@/lib/voyage";
import { normalizeSectionQuery } from "@/lib/specs/chunk";

export type SearchHit = {
  id: string;
  document_id: string;
  document_name: string;
  section: string | null;
  title: string | null;
  page: number;
  page_end: number | null;
  section_page: number | null;
  text: string;
  score: number;
  match_type: "section" | "keyword" | "meaning" | "both";
};

export type SearchResponse = {
  mode: "section" | "section-missing" | "search";
  section?: string;
  hits: SearchHit[];
  note?: string;
};

// GET /api/search?q=...&project=<id>
// Section numbers ("08 71 00") go straight to that section. Anything else runs the hybrid search.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const projectId = req.nextUrl.searchParams.get("project") ?? "";
  if (!q || !projectId) return NextResponse.json({ error: "Missing query or project" }, { status: 400 });

  const supabase = await createClient();
  const section = normalizeSectionQuery(q);

  if (section) {
    const { data, error } = await supabase.rpc("search_doc_section", { p_project_id: projectId, p_section: section });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.length) return NextResponse.json({ mode: "section", section, hits: data } satisfies SearchResponse);

    // Not in the documents as its own section: show where it's mentioned (table of contents, references).
    const { data: mentions, error: mErr } = await supabase.rpc("search_doc_chunks", {
      p_project_id: projectId,
      p_query: `"${section}"`,
      p_limit: 8,
    });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
    return NextResponse.json({
      mode: "section-missing",
      section,
      hits: mentions ?? [],
      note: `Section ${section} isn't in the uploaded documents as its own section.`,
    } satisfies SearchResponse);
  }

  let embedding: string | null = null;
  let note: string | undefined;
  try {
    embedding = toPgVector((await embed([q], "query"))[0]);
  } catch {
    note = "Meaning search is unavailable right now, so these are keyword matches only.";
  }

  const { data, error } = await supabase.rpc("search_doc_chunks", {
    p_project_id: projectId,
    p_query: q,
    p_embedding: embedding,
    p_limit: 8,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mode: "search", hits: data ?? [], note } satisfies SearchResponse);
}
