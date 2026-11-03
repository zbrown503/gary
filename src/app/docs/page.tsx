import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { DocsClient, type DocRow, type Project } from "./docs-client";
import { ProjectSetup } from "./project-setup";

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold">Docs</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />}>
        <DocsLoader />
      </Suspense>
    </main>
  );
}

async function DocsLoader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, number")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Project>();

  if (!project) return <ProjectSetup />;

  const { data: docs } = await supabase
    .from("documents")
    .select("id, name, type, file_path, page_count, chunk_count, status, error, created_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  return <DocsClient userId={user!.id} project={project} initialDocs={(docs ?? []) as DocRow[]} />;
}
