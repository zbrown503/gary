import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signed-in diagnostic: which server keys this deployment can see (never their values),
// and which commit and environment is running.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const key = process.env.VOYAGE_API_KEY;
  const similar = Object.keys(process.env).filter((k) => /voyage/i.test(k) && k !== "VOYAGE_API_KEY");

  return NextResponse.json({
    vercel_env: process.env.VERCEL_ENV ?? "unknown",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
    deployment_url: process.env.VERCEL_URL ?? "unknown",
    VOYAGE_API_KEY: key ? `set (${key.length} chars, starts "${key.slice(0, 3)}")` : "missing",
    VOYAGE_API_KEY_has_spaces: key ? key !== key.trim() : null,
    other_voyage_like_names: similar,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "missing",
  });
}
