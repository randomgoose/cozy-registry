import * as React from "react"
import Link from "next/link"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const hyperlinkVariants = cva(
  "inline rounded-sm font-medium underline-offset-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 hover:underline [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default: "text-primary hover:text-primary/90",
        muted:
          "text-muted-foreground underline-offset-2 hover:text-foreground hover:underline",
        destructive:
          "text-destructive hover:text-destructive/90 focus-visible:ring-destructive/25",
      },
      weight: {
        default: "font-medium",
        normal: "font-normal",
        semibold: "font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      weight: "default",
    },
  }
)

type HyperlinkProps = React.ComponentProps<typeof Link> &
  VariantProps<typeof hyperlinkVariants>

const Hyperlink = React.forwardRef<HTMLAnchorElement, HyperlinkProps>(
  function Hyperlink({ className, variant, weight, ...props }, ref) {
    return (
      <Link
        ref={ref}
        data-slot="hyperlink"
        className={cn(hyperlinkVariants({ variant, weight }), className)}
        {...props}
      />
    )
  }
)

Hyperlink.displayName = "Hyperlink"

export { Hyperlink, hyperlinkVariants }
