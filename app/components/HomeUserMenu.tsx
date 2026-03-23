"use client";

import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type HomeUserMenuProps = {
  fullName: string;
  username: string;
};

const MENU_ITEMS = [
  { href: "/dashboard", label: "My items" },
  { href: "/collections", label: "Collections" },
  { href: "/settings", label: "Settings" },
];

export function HomeUserMenu({ fullName, username }: HomeUserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-zinc-800 data-[popup-open]:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:data-[popup-open]:bg-zinc-200"
          />
        }
      >
        <span className="max-w-[160px] truncate">{fullName}</span>
        <ChevronDown className="size-4 transition-transform duration-200 data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 overflow-hidden rounded-2xl border border-white/60 bg-white/85 p-2 shadow-[0_20px_40px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/88 dark:shadow-[0_24px_44px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)]"
      >
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {fullName}
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {username}
          </p>
        </div>

        <div className="mt-1 space-y-1">
          {MENU_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.href}
              className="rounded-xl px-3 py-2 text-sm text-zinc-700 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-300 dark:focus:bg-black/30 dark:focus:text-zinc-50"
              render={<Link href={item.href} />}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator className="mt-2 bg-zinc-200/80 dark:bg-zinc-800/80" />

        <DropdownMenuItem
          className={cn(
            "mt-2 rounded-xl px-3 py-2 text-sm text-zinc-600 focus:bg-black/[0.06] focus:text-zinc-950 dark:text-zinc-400 dark:focus:bg-black/30 dark:focus:text-zinc-50",
          )}
          render={<button type="button" />}
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/";
          }}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
