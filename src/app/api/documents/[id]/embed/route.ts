import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embed, EMBEDDING_BATCH, toPgVector } from "@/lib/voyage";
import { embeddingInput } from "@/lib/specs/chunk";

export const maxDuration = 60;

const BATCHES_PER_CALL = 3;

// Step 2 of indexing: embed the next few batches of chunks. The Docs screen calls this
// repeatedly until `remaining` is 0, then the document is marked ready.
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/documents/[id]/embed">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  try {
    for (let b = 0; b < BATCHES_PER_CALL; b++) {
      const { data: batch, error } = await supabase
        .from("doc_chunks")
        .select("id, section, title, text")
        .eq("document_id", id)
        .is("embedding", null)
        .order("chunk_index")
        .limit(EMBEDDING_BATCH);
      if (error) throw new Error(error.message);
      if (!batch?.length) break;

      const vectors = await embed(batch.map(embeddingInput), "document");
      const results = await Promise.all(
        batch.map((c, i) => supabase.from("doc_chunks").update({ embedding: toPgVector(vectors[i]) }).eq("id", c.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw new Error(failed.error.message);
    }

    const { count } = await supabase
      .from("doc_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", id)
      .is("embedding", null);
    const remaining = count ?? 0;

    if (remaining === 0) await supabase.from("documents").update({ status: "ready", error: null }).eq("id", id);
    return NextResponse.json({ remaining });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Embedding failed";
    await supabase.from("documents").update({ status: "error", error: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
