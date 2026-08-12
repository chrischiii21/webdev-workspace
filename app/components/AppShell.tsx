"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/roles";
import type { Task } from "@/lib/kanbanStore";
import { isTaskMoved, isTaskNew, readDismissed } from "@/lib/kanbanBadges";
import ThemeToggle from "./ThemeToggle";

const CHROMELESS_PATHS = ["/login"];

const TOOL_LINKS = [
  { href: "/", label: "Brand Extractor", icon: PaletteIcon },
  { href: "/optimize", label: "Image Optimizer", icon: OptimizeIcon },
  { href: "/kanban", label: "Kanban Board", icon: BoardIcon },
  { href: "/reports", label: "Reports", icon: ReportIcon },
];

const ADMIN_LINKS = [{ href: "/users", label: "Users", icon: UsersIcon }];

function PaletteIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7.5" cy="8" r="1" fill="currentColor" />
      <circle cx="10" cy="6.5" r="1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

function OptimizeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
      <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
      <rect x="3" y="4" width="4" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="4" width="4" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="4" width="4" height="10" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
      <rect x="3" y="3" width="14" height="14" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 13V9M10 13V6.5M13.5 13v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
      <circle cx="7.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 16c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M13 5.2c1.2.4 2 1.5 2 2.8s-.8 2.4-2 2.8M15.5 16c0-2.3-1.6-4.2-3.7-4.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <rect x="3" y="4" width="14" height="12" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4v12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ChevronUpDownIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0">
      <path d="M6.5 8.5 10 5l3.5 3.5M6.5 11.5 10 15l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0">
      <path d="M8 3.5H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 13.5 16 10l-3.5-3.5M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function displayName(email: string) {
  const local = email.split("@")[0] ?? email;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function AppShell({
  user,
  children,
}: {
  user: { email: string; role: Role; name: string | null } | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kanbanBadge, setKanbanBadge] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/kanban");
        const data = await res.json();
        const dismissed = readDismissed();
        const tasks: Task[] = data.tasks ?? [];
        const count = tasks.filter(
          (t) => isTaskNew(t, dismissed) || isTaskMoved(t, dismissed),
        ).length;
        if (!cancelled) setKanbanBadge(count);
      } catch {
        // ponytail: badge is best-effort, ignore fetch failures
      }
    }
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user, pathname]);

  if (CHROMELESS_PATHS.includes(pathname)) return <>{children}</>;

  const links = user?.role === "admin" ? [...TOOL_LINKS, ...ADMIN_LINKS] : TOOL_LINKS;
  const current = links.find((l) => l.href === pathname);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`flex h-full shrink-0 flex-col overflow-y-auto border-r border-[var(--surface-border)] transition-[width] duration-150 ${collapsed ? "w-14" : "w-56"}`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-[var(--surface-border)] px-4">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-brand-navy text-xs font-bold text-white">
            W
          </div>
          {!collapsed && (
            <span className="truncate text-sm font-semibold text-foreground">
              WebDev Workspace
            </span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {!collapsed && (
            <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
              Tools
            </p>
          )}
          {TOOL_LINKS.map((link) => (
            <NavLink
              key={link.href}
              link={link}
              active={pathname === link.href}
              collapsed={collapsed}
              badge={link.href === "/kanban" ? kanbanBadge : undefined}
            />
          ))}

          {user?.role === "admin" && (
            <>
              {!collapsed && (
                <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">
                  Admin
                </p>
              )}
              {ADMIN_LINKS.map((link) => (
                <NavLink key={link.href} link={link} active={pathname === link.href} collapsed={collapsed} />
              ))}
            </>
          )}
        </nav>

        {user && (
          <div ref={menuRef} className="relative border-t border-[var(--surface-border)] p-2">
            {menuOpen && (
              <div className="clay absolute bottom-full left-2 right-2 mb-2 flex flex-col gap-0.5 p-1.5 shadow-lg">
                <div className="flex items-center gap-2 rounded-sm px-2 py-1.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                    {user.email[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {user.name || displayName(user.email)}
                    </p>
                    <p className="truncate text-[10px] text-foreground/40">{user.email}</p>
                  </div>
                </div>
                <div className="my-1 border-t border-[var(--surface-border)]" />
                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-brand-red hover:bg-[var(--surface-muted)]"
                >
                  <SignOutIcon />
                  Sign out
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-[var(--surface-muted)]"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-navy text-xs font-semibold text-white">
                {user.email[0]?.toUpperCase()}
              </div>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {user.name || displayName(user.email)}
                    </p>
                    <p className="truncate text-[10px] text-foreground/40">{user.email}</p>
                  </div>
                  <ChevronUpDownIcon />
                </>
              )}
            </button>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--surface-border)] px-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Toggle sidebar"
              onClick={() => setCollapsed((c) => !c)}
              className="clay-btn flex h-8 w-8 items-center justify-center text-foreground/70"
            >
              <CollapseIcon />
            </button>
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
              Workspace{current ? ` · ${current.label}` : ""}
            </p>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  link,
  active,
  collapsed,
  badge,
}: {
  link: { href: string; label: string; icon: () => React.JSX.Element };
  active: boolean;
  collapsed: boolean;
  badge?: number;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      title={collapsed ? link.label : undefined}
      className={`flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm font-medium ${
        active ? "bg-brand-navy text-white" : "text-foreground/70 hover:bg-[var(--surface-muted)]"
      }`}
    >
      <Icon />
      {!collapsed && <span className="truncate">{link.label}</span>}
      {!collapsed && !!badge && (
        <span className="ml-auto shrink-0 rounded-full bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
