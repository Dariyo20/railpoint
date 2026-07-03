"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { href: "/plans/new", label: "Create plan" },
  { href: "/dashboard", label: "Dashboard" },
];

export function AppHeader() {
  const [isOpen, setIsOpen] = useState(false);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <header className="border-b border-[var(--border)] bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-4">
          <Link href="/" className="min-w-0 flex items-center gap-3" onClick={closeMenu}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background-subtle)] text-sm font-semibold text-[var(--foreground)]">
              RP
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                Railpoint
              </p>
              <p className="truncate text-xs text-[var(--foreground-muted)]">
                Recurring billing with smart recovery
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 text-sm text-[var(--foreground-muted)] md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 transition hover:bg-[var(--background-subtle)] hover:text-[var(--foreground)]"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/plans/new"
              className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
            >
              New plan
            </Link>
          </nav>

          <button
            type="button"
            aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isOpen}
            onClick={() => setIsOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-white text-[var(--foreground)] transition hover:bg-[var(--background-subtle)] md:hidden"
          >
            <span className="flex flex-col gap-1.5">
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
              <span className="block h-0.5 w-4 bg-current" />
            </span>
          </button>
        </div>

        {isOpen ? (
          <nav className="border-t border-[var(--border)] py-3 md:hidden">
            <div className="flex flex-col gap-1 text-sm">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="rounded-md px-3 py-3 text-[var(--foreground)] transition hover:bg-[var(--background-subtle)]"
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/plans/new"
                onClick={closeMenu}
                className="mt-2 inline-flex items-center justify-center rounded-md bg-[var(--accent)] px-4 py-3 font-medium text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
              >
                New plan
              </Link>
            </div>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
