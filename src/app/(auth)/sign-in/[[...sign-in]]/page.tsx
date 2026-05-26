// Cloud-only: Clerk-rendered sign-in. The (auth) route group already
// provides a bare, centered layout. In self-host mode this route is
// effectively dead code — the user never reaches it because the proxy
// redirects to /login instead.

import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <SignIn
      appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "bg-surface-container-low border border-outline-variant shadow-none",
        },
      }}
    />
  );
}
