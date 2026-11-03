"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Today", icon: Home },
  { href: "/docs", label: "Docs", icon: FileText },
];

export function BottomNav() {
  const path = usePathname();
  if (path.startsWith("/login")) return null;
  return (
    <nav className="sticky bottom-0 z-10 border-t border-neutral-200 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800">
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-semibold",
                active ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"
              )}
            >
              <Icon className="h-6 w-6" aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
