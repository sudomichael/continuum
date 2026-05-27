// Tiny event bus that lets non-chat components ask the project chat to
// open with a pre-filled prompt. Lives at module scope so anyone on the
// project page can fire askBrain() without prop-drilling through layouts.
//
// Why not React Context? The chat panel is a sibling of OpenThreadsList,
// not an ancestor. Wiring a provider just to share one callback for a
// single-page concern is more ceremony than it's worth.

type Listener = (prompt: string) => void;

const listeners: Set<Listener> = new Set();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function askBrain(prompt: string): void {
  for (const fn of listeners) fn(prompt);
}
