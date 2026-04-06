import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "w-full min-w-0 rounded-md border py-0.5 transition-colors outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        default:
          "h-7 px-2 text-sm file:h-6 file:text-xs/relaxed md:text-xs/relaxed [&_svg:not([class*='size-'])]:size-4",
        xs: "h-5 rounded-sm px-1.5 text-[0.625rem] file:h-4 file:text-[0.625rem] [&_svg:not([class*='size-'])]:size-2.5",
        sm: "h-6 px-2 text-xs/relaxed file:h-5 file:text-xs/relaxed [&_svg:not([class*='size-'])]:size-3",
        lg: "h-8 px-2.5 text-xs/relaxed file:h-7 file:text-xs/relaxed [&_svg:not([class*='size-'])]:size-4",
      },
      variant: {
        default:
          "bg-input-background border-input text-foreground file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
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
      size: "default",
      variant: "default",
      onInverse: false,
    },
  }
)

const leftIconLayout = {
  default: { inset: "left-2", pad: "pl-7", icon: "[&_svg]:size-4" },
  xs: { inset: "left-1.5", pad: "pl-4.5", icon: "[&_svg]:size-2.5" },
  sm: { inset: "left-2", pad: "pl-6", icon: "[&_svg]:size-3" },
  lg: { inset: "left-2.5", pad: "pl-8", icon: "[&_svg]:size-4" },
} as const

type InputProps = Omit<React.ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants> & {
    leftIcon?: React.ReactNode
  }

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    type,
    size = "default",
    variant,
    onInverse = false,
    leftIcon,
    ...props
  },
  ref
) {
  const resolvedSize = size ?? "default"
  const iconLayout = leftIconLayout[resolvedSize]

  const input = (
    <InputPrimitive
      ref={ref}
      type={type}
      data-slot="input"
      data-size={resolvedSize}
      data-variant={variant ?? "default"}
      data-on-inverse={onInverse ? "" : undefined}
      className={cn(
        inputVariants({ size, variant, onInverse }),
        leftIcon && iconLayout.pad,
      )}
      {...props}
    />
  )

  if (!leftIcon) {
    return input
  }

  return (
    <div className={cn("relative w-full min-w-0", className)}>
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 z-1 flex items-center text-muted-foreground [&_svg]:shrink-0 [&_svg]:block",
          iconLayout.inset,
          iconLayout.icon,
          onInverse && "text-on-inverse-muted-fg"
        )}
        aria-hidden
      >
        {leftIcon}
      </div>
      {input}
    </div>
  )
})

Input.displayName = "Input"

export { Input, inputVariants }
