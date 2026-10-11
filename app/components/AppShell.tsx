"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AddBookSearch } from "./AddBookSearch";
import { Icon, type IconName } from "./Icon";
import { Toaster } from "./Toaster";

// Sections appear here as they ship; the mobile tab bar shows once there is
// more than one place to go.
const NAV: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/reading", label: "독서 기록", icon: "bookOpen" },
  { href: "/shelf", label: "내 서재", icon: "shelf" },
  { href: "/watch", label: "관심도서", icon: "bookmark" },
  { href: "/stats", label: "통계", icon: "chart" },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-1.5 py-1 text-[15px] font-bold tracking-tight" aria-label="책갈피 홈">
      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink">
        <Icon name="book" className="size-4" />
      </span>
      {/* Phones keep just the mark so the search field gets the width. */}
      <span className="hidden sm:inline">책갈피</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Brand />
        <nav className="mt-6 flex flex-col gap-0.5" aria-label="주요 메뉴">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors ${
                isActive(item.href) ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink"
              }`}
            >
              <Icon name={item.icon} className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
              isActive("/settings") ? "bg-sunken text-ink" : "text-muted hover:bg-sunken hover:text-ink"
            }`}
          >
            <Icon name="settings" className="size-4" />
            가져오기 · 설정
          </Link>
          <p className="mt-3 px-2.5 text-[11.5px] leading-relaxed text-faint">도서 정보 제공: 알라딘</p>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 lg:px-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <AddBookSearch />
          <Link href="/settings" className="icon-btn lg:hidden" aria-label="가져오기 · 설정">
            <Icon name="settings" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 lg:px-8 lg:pb-12">{children}</main>

      {NAV.length > 1 && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
          aria-label="주요 메뉴"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                isActive(item.href) ? "text-ink" : "text-faint"
              }`}
            >
              <Icon name={item.icon} className="size-5" />
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      <Toaster />
    </div>
  );
}
