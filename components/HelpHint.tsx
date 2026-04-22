"use client";

import { Info } from "lucide-react";

interface HelpHintProps {
  text: string;
}

export function HelpHint({ text }: HelpHintProps) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-400 transition group-hover:border-zinc-300 group-hover:text-zinc-700">
        <Info className="h-3.5 w-3.5" />
      </span>
      <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden w-64 -translate-y-1/2 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium leading-5 text-zinc-600 shadow-xl group-hover:block">
        {text}
      </span>
    </span>
  );
}
