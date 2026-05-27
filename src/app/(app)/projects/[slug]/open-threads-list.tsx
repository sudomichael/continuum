"use client";

// Parses the synthesized `openThreads` markdown into discrete items, then
// renders each as a button that opens the project chat with a prompt
// asking the AI to drill in.
//
// This is the bridge between PM-level rehydration ("here are the things
// hanging in the air") and engineering-depth drill-down ("show me every
// session that touched this"). Threads are observations, not TODOs — no
// checkboxes, no state machine, no nagging.

import { Icon } from "@/components/icon";
import { askBrain } from "./chat-bus";

export function OpenThreadsList({ content }: { content: string | null }) {
  const items = parseBullets(content ?? "");
  const empty = items.length === 0;

  return (
    <section className="bg-surface-container-low border border-outline-variant rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="forum" className="text-primary text-[18px]" />
        <h3 className="label-caps text-on-surface-variant">Open threads</h3>
      </div>

      {empty ? (
        <p className="text-[13px] text-on-surface-variant/50 italic">
          Nothing in the air right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((t, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => askBrain(promptFor(t))}
                className="w-full text-left text-[13px] text-on-surface px-3 py-2 rounded border border-outline-variant/40 bg-surface-container-lowest hover:border-primary/60 hover:bg-primary-container/10 transition-colors flex items-start gap-2 group"
              >
                <span className="text-primary text-[12px] mt-[2px] shrink-0">›</span>
                <span className="flex-1">{t}</span>
                <Icon
                  name="chat_bubble"
                  className="text-on-surface-variant/30 group-hover:text-primary text-[14px] shrink-0 mt-[1px]"
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!empty && (
        <p className="mt-3 text-[10px] text-on-surface-variant/40">
          Click any thread to ask the brain for the full context.
        </p>
      )}
    </section>
  );
}

// Pull bullet items out of synthesized markdown. The synthesis prompt asks
// for short bullets but the model sometimes returns a single paragraph or
// numbered items — handle all three.
function parseBullets(text: string): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Case 1: real bullets ("- foo" / "* foo" / "1. foo")
  const bulleted = lines
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, ""))
    .filter((l) => l.length > 0 && l !== text.trim());

  if (bulleted.length >= 2) return bulleted;

  // Case 2: model returned one paragraph. Split on sentence boundaries —
  // imperfect but better than rendering one giant unclickable blob.
  if (lines.length === 1 && lines[0].length > 0) {
    const sentences = lines[0]
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 4);
    if (sentences.length > 1) return sentences;
  }

  // Case 3: each line is a thread on its own (rare but seen).
  return lines.filter((l) => l.length > 0);
}

function promptFor(thread: string): string {
  // The prompt we send to the chat backend when the user clicks a thread.
  // Tuned to elicit (a) what the thread is, (b) what past sessions said
  // about it, (c) what's unresolved — quoting sources where possible.
  return `Drill into this open thread:

> ${thread}

What's the full context? Quote relevant past sessions or decisions. What's still unresolved?`;
}
