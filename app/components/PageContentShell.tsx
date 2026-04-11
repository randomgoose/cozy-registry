import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageContentShellProps = {
  children: ReactNode;
  className?: string;
  size?: "narrow" | "default" | "wide";
};

const SIZE_CLASSNAME: Record<NonNullable<PageContentShellProps["size"]>, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
};

export function PageContentShell({
  children,
  className,
  size = "default",
}: PageContentShellProps) {
  return (
    <div className={cn("mx-auto w-full", SIZE_CLASSNAME[size], className)}>
      {children}
    </div>
  );
}
