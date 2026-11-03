import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPages } from "@/lib/specs/extract";
import { chunkSpecPages } from "@/lib/specs/chunk";

export const maxDuration = 60;

// Step 1 of indexing: download the PDF, extract text page by page, split into chunks, save them.
// Embeddings are added afterwards in batches by /embed so no single request runs too long.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/index">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: doc, error } = await supabase.from("documents").select("*").eq("id", id).single();
  if (error || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const fail = async (message: string) => {
    await supabase.from("documents").update({ status: "error", error: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  };

  try {
    await supabase.from("documents").update({ status: "indexing", error: null }).eq("id", id);

    const { data: file, error: dlError } = await supabase.storage.from("documents").download(doc.file_path);
    if (dlError || !file) return fail(`Could not read the uploaded file: ${dlError?.message ?? "missing"}`);

    const pages = await extractPages(new Uint8Array(await file.arrayBuffer()));
    const textPages = pages.filter((p) => p.trim().length > 40).length;
    if (textPages === 0) {
      return fail("No text found in this PDF. It may be a scan; scanned pages need OCR, which isn't built yet.");
    }

    const chunks = chunkSpecPages(pages);

    // Re-indexing replaces any earlier chunks for this document.
    await supabase.from("doc_chunks").delete().eq("document_id", id);
    const rows = chunks.map((c, i) => ({
      document_id: id,
      project_id: doc.project_id,
      chunk_index: i,
      section: c.section,
      title: c.title,
      page: c.page,
      page_end: c.page_end,
      section_page: c.section_page,
      text: c.text,
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const { error: insError } = await supabase.from("doc_chunks").insert(rows.slice(i, i + 200));
      if (insError) return fail(`Saving chunks failed: ${insError.message}`);
    }

    await supabase
      .from("documents")
      .update({ page_count: pages.length, chunk_count: rows.length })
      .eq("id", id);

    return NextResponse.json({ pages: pages.length, chunks: rows.length });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Indexing failed");
  }
}
