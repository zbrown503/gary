"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, Search, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SearchHit, SearchResponse } from "@/app/api/search/route";

export type Project = { id: string; name: string; number: string | null };
export type DocRow = {
  id: string;
  name: string;
  type: string;
  file_path: string;
  page_count: number | null;
  chunk_count: number;
  status: "uploading" | "indexing" | "ready" | "error";
  error: string | null;
  created_at: string;
};

type Progress = { label: string; pct: number };

const DOC_TYPES = [
  { value: "spec", label: "Specifications" },
  { value: "contract", label: "Contract" },
  { value: "other", label: "Other" },
];

export function DocsClient({ userId, project, initialDocs }: { userId: string; project: Project; initialDocs: DocRow[] }) {
  const supabase = useRef(createClient()).current;
  const [docs, setDocs] = useState(initialDocs);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [docType, setDocType] = useState("spec");
  const fileInput = useRef<HTMLInputElement>(null);

  const patchDoc = (id: string, patch: Partial<DocRow>) =>
    setDocs((d) => d.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const setProg = (id: string, p: Progress | null) =>
    setProgress((cur) => {
      const next = { ...cur };
      if (p) next[id] = p;
      else delete next[id];
      return next;
    });

  // Embeds chunks batch by batch until none are left.
  const runEmbed = useCallback(async (id: string, total: number) => {
    for (;;) {
      const res = await fetch(`/api/documents/${id}/embed`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Embedding failed");
      const done = Math.max(0, total - json.remaining);
      setProg(id, { label: `Indexing for search ${done} / ${total}`, pct: 30 + Math.round((done / Math.max(total, 1)) * 70) });
      if (json.remaining === 0) return;
    }
  }, []);

  const runIndex = useCallback(
    async (doc: DocRow) => {
      try {
        patchDoc(doc.id, { status: "indexing", error: null });
        setProg(doc.id, { label: "Reading pages and splitting sections…", pct: 15 });
        const res = await fetch(`/api/documents/${doc.id}/index`, { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Indexing failed");
        patchDoc(doc.id, { page_count: json.pages, chunk_count: json.chunks });
        await runEmbed(doc.id, json.chunks);
        patchDoc(doc.id, { status: "ready" });
      } catch (e) {
        patchDoc(doc.id, { status: "error", error: e instanceof Error ? e.message : "Indexing failed" });
      } finally {
        setProg(doc.id, null);
      }
    },
    [runEmbed]
  );

  const resumeEmbed = useCallback(
    async (doc: DocRow) => {
      try {
        patchDoc(doc.id, { status: "indexing", error: null });
        await runEmbed(doc.id, doc.chunk_count);
        patchDoc(doc.id, { status: "ready" });
      } catch (e) {
        patchDoc(doc.id, { status: "error", error: e instanceof Error ? e.message : "Indexing failed" });
      } finally {
        setProg(doc.id, null);
      }
    },
    [runEmbed]
  );

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        alert(`${file.name} isn't a PDF. Only PDFs can be indexed for now.`);
        continue;
      }
      const id = crypto.randomUUID();
      const filePath = `${userId}/${project.id}/${id}.pdf`;
      const name = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
      const row: DocRow = {
        id, name, type: docType, file_path: filePath, page_count: null, chunk_count: 0,
        status: "uploading", error: null, created_at: new Date().toISOString(),
      };
      setDocs((d) => [...d, row]);
      setProg(id, { label: `Uploading ${(file.size / 1e6).toFixed(1)} MB…`, pct: 5 });

      const { error: insErr } = await supabase
        .from("documents")
        .insert({ id, project_id: project.id, name, type: docType, file_path: filePath, status: "uploading" });
      if (insErr) {
        patchDoc(id, { status: "error", error: insErr.message });
        setProg(id, null);
        continue;
      }
      const { error: upErr } = await supabase.storage
        .from("documents")
        .upload(filePath, file, { contentType: "application/pdf", upsert: true });
      if (upErr) {
        await supabase.from("documents").update({ status: "error", error: upErr.message }).eq("id", id);
        patchDoc(id, { status: "error", error: upErr.message });
        setProg(id, null);
        continue;
      }
      await runIndex(row);
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function openPdf(filePath: string, page?: number) {
    const { data, error } = await supabase.storage.from("documents").createSignedUrl(filePath, 600);
    if (error || !data) return alert(error?.message ?? "Couldn't open the file");
    window.open(page ? `${data.signedUrl}#page=${page}` : data.signedUrl, "_blank", "noopener");
  }

  const readyCount = docs.filter((d) => d.status === "ready").length;

  return (
    <div className="space-y-6">
      <p className="-mt-4 text-neutral-500">
        {project.name}
        {project.number ? ` · ${project.number}` : ""}
      </p>

      <SearchBox projectId={project.id} enabled={readyCount > 0 || docs.some((d) => d.chunk_count > 0)} docs={docs} onOpen={openPdf} />

      <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="mb-3 font-semibold">Upload documents</h2>
        <div className="flex gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="h-12 rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-700"
            aria-label="Document type"
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <Button className="flex-1" onClick={() => fileInput.current?.click()}>
            <Upload className="h-5 w-5" aria-hidden /> Choose PDFs
          </Button>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
        </div>
        <p className="mt-2 text-sm text-neutral-500">Keep this screen open while large spec books index (about a minute per volume).</p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Documents</h2>
        {docs.length === 0 && <p className="text-neutral-500">No documents yet.</p>}
        <ul className="space-y-3">
          {docs.map((d) => {
            const p = progress[d.id];
            return (
              <li key={d.id} className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-6 w-6 shrink-0 text-neutral-400" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <button className="truncate text-left font-semibold hover:underline" onClick={() => openPdf(d.file_path)}>
                      {d.name}
                    </button>
                    <p className="text-sm text-neutral-500">
                      {DOC_TYPES.find((t) => t.value === d.type)?.label ?? d.type}
                      {d.page_count ? ` · ${d.page_count} pages` : ""}
                      {d.chunk_count ? ` · ${d.chunk_count} sections & articles indexed` : ""}
                    </p>
                    {p ? (
                      <div className="mt-2">
                        <div className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                          <div className="h-full bg-amber-500 transition-all" style={{ width: `${p.pct}%` }} />
                        </div>
                        <p className="mt-1 text-sm text-neutral-500">{p.label}</p>
                      </div>
                    ) : d.status === "ready" ? (
                      <p className="mt-1 flex items-center gap-1 text-sm text-green-700 dark:text-green-500">
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Ready
                      </p>
                    ) : d.status === "error" ? (
                      <div className="mt-1">
                        <p className="flex items-start gap-1 text-sm text-red-600">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {d.error ?? "Indexing failed"}
                        </p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => (d.chunk_count ? resumeEmbed(d) : runIndex(d))}>
                          Try again
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <p className="text-sm text-neutral-500">Indexing stopped partway.</p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => (d.chunk_count ? resumeEmbed(d) : runIndex(d))}>
                          Finish indexing
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function SearchBox({
  projectId,
  enabled,
  docs,
  onOpen,
}: {
  projectId: string;
  enabled: boolean;
  docs: DocRow[];
  onOpen: (filePath: string, page?: number) => void;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?project=${projectId}&q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Search failed");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const filePathFor = (docId: string) => docs.find((d) => d.id === docId)?.file_path;

  return (
    <section>
      <form onSubmit={search} className="flex gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={enabled ? 'Search specs: "07 92 00" or "sealant mock-up"' : "Upload a document to search"}
          disabled={!enabled}
          aria-label="Search documents"
        />
        <Button type="submit" disabled={!enabled || loading} aria-label="Search">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3">
          {result.mode === "section-missing" && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
              <p className="font-semibold">{result.note}</p>
              {result.hits.length > 0 && <p className="mt-1 text-sm">Here&apos;s where it&apos;s mentioned:</p>}
            </div>
          )}
          {result.note && result.mode === "search" && <p className="text-sm text-neutral-500">{result.note}</p>}
          {result.hits.length === 0 && result.mode !== "section-missing" && (
            <p className="text-neutral-500">Nothing found in the uploaded documents.</p>
          )}
          {result.hits.map((h) => (
            <Hit key={h.id} hit={h} query={q} onOpen={() => {
              const fp = filePathFor(h.document_id);
              if (fp) onOpen(fp, h.page);
            }} />
          ))}
        </div>
      )}
    </section>
  );
}

function citation(h: SearchHit) {
  const parts = [h.document_name];
  if (h.section === "TOC") parts.push("Table of Contents");
  else if (h.section) parts.push(`Section ${h.section}${h.section_page ? `, p. ${h.section_page}` : ""}`);
  parts.push(`PDF p. ${h.page}`);
  return parts.join(" · ");
}

function Hit({ hit, query, onOpen }: { hit: SearchHit; query: string; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const text = open ? hit.text : hit.text.slice(0, 320) + (hit.text.length > 320 ? "…" : "");
  return (
    <article className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">{citation(hit)}</p>
      {hit.title && hit.section !== "TOC" && <h3 className="mt-1 font-semibold">{hit.title}</h3>}
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">
        <Highlight text={text} query={query} />
      </p>
      <div className="mt-3 flex gap-2">
        {hit.text.length > 320 && (
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? "Show less" : "Show more"}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onOpen}>
          <ExternalLink className="h-4 w-4" aria-hidden /> Open page {hit.page}
        </Button>
      </div>
    </article>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query
    .replace(/"/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 2)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-800">{part}</mark>
        ) : (
          part
        )
      )}
    </>
  );
}
