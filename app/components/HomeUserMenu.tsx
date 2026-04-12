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
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type HomeUserMenuProps = {
  fullName: string;
  username: string;
  avatarUrl?: string | null;
};

const MENU_ITEMS = [
  { href: "/me", label: "My items" },
  { href: "/me/projects", label: "Projects" },
  { href: "/me/settings", label: "Settings" },
];

export function HomeUserMenu({ fullName, username, avatarUrl }: HomeUserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant={"ghost"} size={"lg"} />
        }
      >
        <Avatar>
          <AvatarFallback>{fullName.charAt(0)}</AvatarFallback>
          <AvatarImage src={avatarUrl ?? undefined} />
        </Avatar>
        <span className="max-w-[160px] truncate">{fullName}</span>
        <ChevronDown className="size-4 transition-transform duration-200 data-[popup-open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
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
              render={<Link href={item.href} />}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator className="mt-2 bg-zinc-200/80 dark:bg-zinc-800/80" />

        <DropdownMenuItem
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
