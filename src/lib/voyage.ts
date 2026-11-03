import "server-only";

// Voyage AI embeddings (voyage-4, 1024 dimensions). Server-only: the key never reaches the browser.
const MODEL = "voyage-4";
export const EMBEDDING_BATCH = 64;

function baseUrl(key: string) {
  // Keys from MongoDB Atlas start with "al-"; keys from the Voyage dashboard start with "pa-".
  return key.startsWith("al-") ? "https://ai.mongodb.com/v1" : "https://api.voyageai.com/v1";
}

export async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set in Vercel environment variables.");
  if (!texts.length) return [];

  const res = await fetch(`${baseUrl(key)}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType, output_dimension: 1024 }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Voyage embeddings failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** pgvector accepts a vector as its text form: "[0.1,0.2,...]". */
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
