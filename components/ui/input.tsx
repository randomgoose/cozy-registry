import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "h-7 w-full min-w-0 rounded-md border px-2 py-0.5 text-sm transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs/relaxed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-input bg-input/20 text-foreground file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        fill: "border-0 bg-muted/90 text-foreground shadow-none file:text-foreground placeholder:text-muted-foreground ring-0 focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-0 aria-invalid:ring-2 aria-invalid:ring-destructive/25 dark:bg-muted/45 dark:aria-invalid:ring-destructive/40",
      },
      onInverse: {
        true: "border-on-inverse-border bg-on-inverse-surface text-on-inverse-fg file:text-on-inverse-fg placeholder:text-on-inverse-muted-fg focus-visible:border-on-inverse-border focus-visible:ring-2 focus-visible:ring-on-inverse-ring/45 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/35 dark:border-on-inverse-border dark:bg-on-inverse-surface dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "fill",
        onInverse: true,
        class: "border-0 focus-visible:border-0 aria-invalid:border-0 dark:border-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      onInverse: false,
    },
  }
)

function Input({
  className,
  type,
  variant,
  onInverse = false,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof inputVariants>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      data-variant={variant ?? "default"}
      data-on-inverse={onInverse ? "" : undefined}
      className={cn(inputVariants({ variant, onInverse }), className)}
      {...props}
    />
  )
}

export { Input, inputVariants }
