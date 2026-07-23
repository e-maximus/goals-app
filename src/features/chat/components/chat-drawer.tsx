"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { toast } from "sonner";
import { SendHorizontal, Square } from "lucide-react";

import { useChatUi } from "@/lib/chat-ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Markdown } from "./markdown";

/**
 * The assistant: a slide-over chat that drives the same goals/tasks operations
 * an agent gets over MCP, but in-app. It's mounted once in the app layout and
 * opened from the Topbar via {@link useChatUi}.
 *
 * The agent writes to the server directly, bypassing the optimistic store, so
 * when a turn finished with any tool call we pull the server's copy back into
 * the store ({@link useStore.reloadFromServer}) — the same clean overwrite the
 * store does on a 409. Input is disabled while a reply streams, so one turn
 * finishes before the next begins.
 */
export function ChatDrawer() {
  const open = useChatUi((s) => s.open);
  const setOpen = useChatUi((s) => s.setOpen);
  const reloadFromServer = useStore((s) => s.reloadFromServer);

  const [input, setInput] = useState("");
  const seeded = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const smoothScroll = useRef(false);

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    onError: () =>
      toast.error("The assistant hit a problem", { description: "Please try again in a moment." }),
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError) return;
      const usedTools = (message.parts ?? []).some((p) => isToolPart(p));
      if (usedTools) void reloadFromServer();
    },
  });

  // Seed the thread's persisted history the first time the drawer opens.
  useEffect(() => {
    if (!open || seeded.current) return;
    seeded.current = true;
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { messages?: UIMessage[] }) => setMessages(data.messages ?? []))
      .catch(() => {
        // No history (or a transient error) — just start from an empty thread.
      });
  }, [open, setMessages]);

  // Arm a smooth scroll each time the drawer opens; a sent message disarms it so
  // streaming stays an instant, jank-free follow.
  useEffect(() => {
    if (open) smoothScroll.current = true;
  }, [open]);

  // Keep the newest message in view. Smooth on open (once history is laid out),
  // instant while a reply streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (status === "submitted" || status === "streaming") smoothScroll.current = false;
    el.scrollTo({ top: el.scrollHeight, behavior: smoothScroll.current ? "smooth" : "auto" });
  }, [messages, status, open]);

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent aria-describedby={undefined} className="max-w-[498px]">
        <SheetHeader className="pr-12">
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>Ask it to plan or update your goals and tasks.</SheetDescription>
        </SheetHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Try “Add a goal to run a 5k, with three steps”.
            </p>
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
          {status === "submitted" && (
            <p className="text-xs text-muted-foreground italic">Thinking…</p>
          )}
        </div>

        <form
          className="flex items-end gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Message the assistant…"
            aria-label="Message the assistant"
            rows={1}
            disabled={busy}
            className="max-h-40 min-h-9"
          />
          {busy ? (
            <Button type="button" variant="outline" size="icon" onClick={() => stop()} aria-label="Stop">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <SendHorizontal className="size-4" />
            </Button>
          )}
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {renderParts(message.parts ?? [])}
      </div>
    </div>
  );
}

/**
 * Render a message's parts, folding runs of consecutive tool calls into one
 * line per tool name with a count (`Done: add step ×24`) so a bulk operation
 * doesn't spam a wall of identical lines. Text and reasoning parts break a run.
 */
function renderParts(parts: UIMessage["parts"]): ReactNode[] {
  const out: ReactNode[] = [];
  let run: UIMessage["parts"] = [];
  const flush = (key: string) => {
    if (run.length === 0) return;
    out.push(<ToolRun key={key} parts={run} />);
    run = [];
  };
  parts.forEach((part, i) => {
    if (isToolPart(part)) {
      run.push(part);
      return;
    }
    flush(`tools-${i}`);
    out.push(<MessagePart key={i} part={part} />);
  });
  flush("tools-end");
  return out;
}

function MessagePart({ part }: { part: UIMessage["parts"][number] }) {
  const setOpen = useChatUi((s) => s.setOpen);
  const p = part as { type?: string; text?: string };
  if (p.type === "text") {
    return <Markdown onNavigate={() => setOpen(false)}>{p.text ?? ""}</Markdown>;
  }
  if (p.type === "reasoning") {
    if (!p.text?.trim()) return null;
    return <ReasoningPart text={p.text} />;
  }
  return null;
}

/** Collapse a run of tool parts into one line per tool name, with a count. */
function ToolRun({ parts }: { parts: UIMessage["parts"] }) {
  const order: string[] = [];
  const byName = new Map<string, { count: number; working: boolean }>();
  for (const part of parts) {
    const p = part as { type?: string; state?: string };
    const name = (p.type ?? "").slice("tool-".length).replace(/_/g, " ");
    const done = p.state === "output-available" || p.state === "output-error";
    let entry = byName.get(name);
    if (!entry) {
      entry = { count: 0, working: false };
      byName.set(name, entry);
      order.push(name);
    }
    entry.count += 1;
    if (!done) entry.working = true;
  }
  return (
    <div className="text-xs text-muted-foreground italic">
      {order.map((name) => {
        const { count, working } = byName.get(name)!;
        return (
          <p key={name}>
            {working ? "Working: " : "Done: "}
            {name}
            {count > 1 ? ` ×${count}` : ""}
          </p>
        );
      })}
    </div>
  );
}

/** The model's chain-of-thought, shown inline as a muted aside. */
function ReasoningPart({ text }: { text: string }) {
  return (
    <div className="my-1 border-l-2 border-muted-foreground/30 pl-2 text-xs whitespace-pre-wrap text-muted-foreground italic">
      {text}
    </div>
  );
}

/** A UIMessage part representing a tool call (`type: "tool-<name>"`). */
function isToolPart(part: UIMessage["parts"][number]): boolean {
  const type = (part as { type?: string }).type;
  return typeof type === "string" && type.startsWith("tool-");
}
