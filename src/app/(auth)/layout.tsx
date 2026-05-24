// Bare layout for /login — no AppShell, no nav.

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
