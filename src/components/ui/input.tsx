import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-lg border border-neutral-300 bg-transparent px-4 text-base dark:border-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
        className
      )}
      {...props}
    />
  );
}
