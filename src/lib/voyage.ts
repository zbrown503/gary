import "server-only";

// Voyage AI embeddings (voyage-4, 1024 dimensions). Server-only: the key never reaches the browser.
const MODEL = "voyage-4";
export const EMBEDDING_BATCH = 64;

function baseUrl(key: string) {
  // Keys from MongoDB Atlas start with "al-"; keys from the Voyage dashboard start with "pa-".
  return key.startsWith("al-") ? "https://ai.mongodb.com/v1" : "https://api.voyageai.com/v1";
}

export async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      `VOYAGE_API_KEY is not set for this deployment (${process.env.VERCEL_ENV ?? "unknown"} environment, commit ${process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown"}).`
    );
  }
  if (!texts.length) return [];

  // On "slow down" (429), wait and retry a couple of times before giving up,
  // staying well inside the route's 60-second limit.
  const MAX_TRIES = 3;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${baseUrl(key)}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType, output_dimension: 1024 }),
    });
    if (res.ok) {
      const json = (await res.json()) as { data: { embedding: number[]; index: number }[] };
      return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }

    const detail = await res.text().catch(() => "");
    if (res.status === 429 && attempt < MAX_TRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 5000 * attempt, 15000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status === 429 && /payment method/i.test(detail)) {
      throw new Error(
        "Voyage is limiting this account to 3 requests a minute until a payment method is added at dashboard.voyageai.com → Billing. Free tokens still apply. Add it, then tap Try again."
      );
    }
    if (res.status === 429) throw new Error("Voyage is busy (rate limited). Wait a minute, then tap Try again.");
    if (res.status === 401) throw new Error("Voyage rejected the API key. Check VOYAGE_API_KEY in Vercel.");
    throw new Error(`Voyage embeddings failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

/** pgvector accepts a vector as its text form: "[0.1,0.2,...]". */
export const toPgVector = (v: number[]) => `[${v.join(",")}]`;
