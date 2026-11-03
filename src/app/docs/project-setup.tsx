"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectSetup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createClient()
      .from("projects")
      .insert({ name, number: number || null, address: address || null });
    setSaving(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 className="text-lg font-semibold">Set up your project</h2>
      <p className="mb-4 mt-1 text-neutral-500">Documents are filed under the active project.</p>
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Project name</span>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Fire Station 18" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Project number</span>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Address</span>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Create project"}
        </Button>
      </form>
    </section>
  );
}
