import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

// Today screen placeholder for Milestone 1. The feed arrives in Milestone 4.
export default function TodayPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Today</h1>
        <form action="/auth/signout" method="post">
          <Button variant="ghost" size="sm" type="submit">Sign out</Button>
        </form>
      </header>
      <Suspense fallback={<CardSkeleton />}>
        <WelcomeCard />
      </Suspense>
    </main>
  );
}

async function WelcomeCard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });

  return (
    <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800">
      <p className="text-sm text-neutral-500">{today}</p>
      <p className="mt-2 font-semibold">Gary is set up.</p>
      <p className="mt-1 text-neutral-500">
        Signed in as {user?.email}. Your to-dos, drafts and look-ahead will show up here.
      </p>
    </section>
  );
}

function CardSkeleton() {
  return <section className="h-28 animate-pulse rounded-xl bg-neutral-100 dark:bg-neutral-900" />;
}
