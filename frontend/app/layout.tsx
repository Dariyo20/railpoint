import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/AppHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Railpoint",
    template: "%s | Railpoint",
  },
  description:
    "Recurring billing and recovery workflows for Nigerian membership businesses.",
  applicationName: "Railpoint",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <div className="min-h-screen">
          <AppHeader />

          <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
            {children}
          </main>

          <footer className="border-t border-[var(--border)] bg-white">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-[var(--foreground-muted)] sm:px-6 lg:px-8">
              <p>Recurring billing for membership businesses.</p>
              <p>
                Built around checkout, tokenized recurring charges, and
                payment recovery on Nomba.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
