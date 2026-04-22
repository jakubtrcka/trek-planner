"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { HelpHint } from "./HelpHint";
import { cn } from "../lib/utils";

interface FilterSectionProps {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: (id: string) => void;
}

export function FilterSection({ id, label, hint, children, isOpen, onToggle }: FilterSectionProps) {
  return (
    <div className="rounded-2xl border border-zinc-200">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-950">{label}</span>
          {hint && <HelpHint text={hint} />}
        </div>
        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", isOpen && "rotate-180")} />
      </button>
      {isOpen && <div className="border-t border-zinc-200 px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}
