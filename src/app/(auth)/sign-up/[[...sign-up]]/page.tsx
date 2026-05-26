import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <SignUp
      appearance={{
        elements: {
          rootBox: "mx-auto",
          card: "bg-surface-container-low border border-outline-variant shadow-none",
        },
      }}
    />
  );
}
