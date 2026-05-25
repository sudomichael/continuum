"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Auto-refresh the onboarding gate every 4 seconds while steps are still
// pending. That way the user runs `npm run connect-claude-code` in another
// terminal, and the gate updates itself instead of needing a manual refresh.
export function OnboardingPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
