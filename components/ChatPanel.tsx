"use client";

import { Loader2, Send, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { Message } from "ai/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { cn } from "../lib/utils";

interface ChatPanelProps {
  messages: Message[];
  input: string;
  isLoading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function ChatPanel({ messages, input, isLoading, onInputChange, onSubmit }: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false);

  function handleMiniSubmit(e: React.FormEvent<HTMLFormElement>) {
    onSubmit(e);
    setExpanded(true);
  }

  if (expanded) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[850] flex w-[420px] flex-col rounded-3xl border border-zinc-200 bg-white shadow-[0_8px_60px_rgba(15,23,42,0.18)]" style={{ maxHeight: "calc(100vh - 120px)" }}>
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-950 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-900">AI asistent</p>
            <p className="text-xs text-zinc-400">Plánování výletů a tras</p>
          </div>
          <button type="button" onClick={() => setExpanded(false)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="flex-1 px-4 py-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center gap-3 pt-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
                  <Sparkles className="h-5 w-5 text-zinc-400" />
                </div>
                <p className="text-sm font-medium text-zinc-700">Plánuj výlet s AI asistentem</p>
                <p className="text-xs text-zinc-400">Např.: „Naplánuj okruh 10 km z Prahy do hodiny jízdy autem"</p>
              </div>
            )}
            <div className="space-y-4">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  {(m.role === "user" || m.role === "assistant") && (
                    <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6", m.role === "user" ? "rounded-br-sm bg-zinc-950 text-white" : "rounded-bl-sm bg-zinc-100 text-zinc-800")}>
                      {typeof m.content === "string" ? (
                        m.role === "assistant" ? (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                              ul: ({ children }) => <ul className="my-1 space-y-0.5 pl-4 list-disc">{children}</ul>,
                              ol: ({ children }) => <ol className="my-1 space-y-0.5 pl-4 list-decimal">{children}</ol>,
                              li: ({ children }) => <li className="leading-6">{children}</li>,
                              a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 opacity-80 hover:opacity-100">{children}</a>,
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        ) : m.content
                      ) : null}
                      {m.toolInvocations?.map((inv) =>
                        "result" in inv && inv.toolName === "showPointsOnMap" ? (
                          <p key={inv.toolCallId} className="mt-1 text-xs opacity-70">
                            Zobrazeno {((inv.result as { points: unknown[] }).points ?? []).length} bodů na mapě
                          </p>
                        ) : "result" in inv && inv.toolName === "planRoute" && !(inv.result as { error?: string }).error ? (
                          <p key={inv.toolCallId} className="mt-1 text-xs opacity-70">
                            {(inv.result as { summary?: string }).summary}
                          </p>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-4 py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          <form onSubmit={onSubmit} className="shrink-0 border-t border-zinc-200 p-4">
            <div className="flex gap-2">
              <Input value={input} onChange={onInputChange} placeholder="Naplánuj výlet..." className="flex-1 rounded-2xl" disabled={isLoading} />
              <Button type="submit" className="rounded-2xl" disabled={isLoading || !input.trim()}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[850] w-72 rounded-2xl border border-zinc-200 bg-white shadow-[0_4px_30px_rgba(15,23,42,0.12)]">
      <form onSubmit={handleMiniSubmit} className="flex items-center gap-2 p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <Input value={input} onChange={onInputChange} placeholder="Naplánuj výlet..." className="flex-1 rounded-xl border-zinc-200 text-sm" disabled={isLoading} />
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0 rounded-xl" disabled={isLoading || !input.trim()}>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </form>
    </div>
  );
}
