"use client";

// Per-project chat panel. Renders as a slide-in column on the right side
// of the project page. Posts to /api/projects/[slug]/chat which feeds the
// project's synthesized brain + recent updates into the model as context.

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export function ProjectChat({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lazy-load history the first time the user opens the panel — avoids a
  // wasted query on every project-page render when most users never click.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/projects/${slug}/chat`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { messages: Message[] };
        if (!cancelled) {
          setMessages(data.messages);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, loaded, slug]);

  // Auto-scroll to the latest message whenever the list grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);

    // Optimistic insert: show the user message immediately, swap in the
    // server-saved one when the assistant replies.
    const tempId = `local-${Date.now()}`;
    setMessages((m) => [
      ...m,
      {
        id: tempId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setInput("");

    try {
      const r = await fetch(`/api/projects/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { message: Message };
      setMessages((m) => [...m, data.message]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-primary text-on-primary px-4 py-3 shadow-lg hover:opacity-90"
        title="Ask the project brain"
      >
        <Icon name="chat" filled className="text-[18px]" />
        <span className="label-caps text-[11px]">Ask the brain</span>
      </button>
    );
  }

  return (
    <aside className="fixed top-14 right-0 bottom-0 z-30 w-[420px] max-w-[90vw] border-l border-outline-variant bg-surface-container-low flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-outline-variant shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="chat" filled className="text-primary text-[18px] shrink-0" />
          <div className="min-w-0">
            <div className="label-caps text-on-surface">Ask the brain</div>
            <div className="code-sm text-[10px] text-on-surface-variant/60 truncate">
              grounded in this project&apos;s synthesis + recent updates
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-on-surface-variant hover:text-on-surface shrink-0"
          aria-label="Close"
        >
          <Icon name="close" className="text-[20px]" />
        </button>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 && !sending ? (
          <EmptyState />
        ) : (
          messages.map((m) => <MessageRow key={m.id} m={m} />)
        )}
        {sending && (
          <div className="text-[13px] text-on-surface-variant/60 italic">
            thinking…
          </div>
        )}
        {error && (
          <div className="text-[12px] text-red-400" role="alert">
            {error}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-outline-variant p-3 shrink-0"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter to send, shift+Enter for newline (matches chat-UI norm).
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Why did past-me pick scrypt? What's blocking the Stripe integration?"
          rows={3}
          className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 text-[13px] text-on-surface focus:border-primary focus:outline-none resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-on-surface-variant/50">
            Enter to send · Shift+Enter for newline
          </span>
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-primary text-on-primary label-caps text-[10px] py-1 px-3 rounded hover:opacity-90 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Ask"}
          </button>
        </div>
      </form>
    </aside>
  );
}

function EmptyState() {
  // Concrete prompt suggestions that match the product's positioning —
  // observational, history-aware, NOT "what should I work on" coaching.
  const prompts = [
    "What changed since I last looked?",
    "Why did past-me pick that approach?",
    "What's open right now?",
    "Show me everything about Stripe in this project.",
  ];
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-on-surface-variant">
        Ask anything about this project. The brain knows about the
        synthesized state, every session, every decision.
      </p>
      <ul className="space-y-1">
        {prompts.map((p) => (
          <li
            key={p}
            className="text-[12px] text-on-surface-variant/70 italic"
          >
            “{p}”
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageRow({ m }: { m: Message }) {
  const isUser = m.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap ${
          isUser
            ? "bg-primary-container/20 text-on-surface"
            : "bg-surface-container text-on-surface"
        }`}
      >
        {m.content}
      </div>
    </div>
  );
}
