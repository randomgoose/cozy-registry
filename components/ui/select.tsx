"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import { UnfoldMoreIcon, Tick02Icon, ArrowUp01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons"

const SelectOnInverseContext = React.createContext(false)

function useSelectOnInverse(): boolean {
  return React.useContext(SelectOnInverseContext)
}

function Select({
  onInverse = false,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root> & {
  onInverse?: boolean
}) {
  return (
    <SelectOnInverseContext.Provider value={onInverse}>
      <SelectPrimitive.Root data-slot="select" data-on-inverse={onInverse ? "" : undefined} {...props} />
    </SelectOnInverseContext.Provider>
  )
}

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn("flex flex-1 text-left", className)}
      {...props}
    />
  )
}

const selectTriggerVariants = cva(
  "flex items-center justify-between gap-1.5 rounded-md border px-2 py-1.5 text-xs/relaxed whitespace-nowrap transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-7 data-[size=sm]:h-6 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "w-fit border-input bg-input/20 focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        fill: "w-fit border-0 bg-muted/90 shadow-none ring-0 data-placeholder:text-muted-foreground hover:bg-muted/80 focus-visible:border-0 focus-visible:ring-2 focus-visible:ring-ring/30 aria-invalid:border-0 aria-invalid:ring-2 aria-invalid:ring-destructive/25 dark:bg-muted/45 dark:hover:bg-muted/55 dark:aria-invalid:ring-destructive/40",
      },
      onInverse: {
        true: "min-w-0 w-full border-on-inverse-border bg-on-inverse-surface text-on-inverse-fg hover:bg-on-inverse-surface-hover data-placeholder:text-on-inverse-muted-fg focus-visible:border-on-inverse-border focus-visible:ring-on-inverse-ring/40 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/35 dark:border-on-inverse-border dark:bg-on-inverse-surface dark:hover:bg-on-inverse-surface-hover dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        false: "",
      },
    },
    compoundVariants: [
      {
        variant: "fill",
        onInverse: true,
        class:
          "border-0 hover:bg-on-inverse-surface-hover focus-visible:border-0 aria-invalid:border-0 dark:border-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      onInverse: false,
    },
  }
)

function SelectTrigger({
  className,
  size = "default",
  variant,
  onInverse: onInverseProp,
  children,
  ...props
}: SelectPrimitive.Trigger.Props &
  VariantProps<typeof selectTriggerVariants> & {
    size?: "sm" | "default"
  }) {
  const ctxOnInverse = useSelectOnInverse()
  const onInverse = onInverseProp ?? ctxOnInverse
  const v = variant ?? "default"
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      data-on-inverse={onInverse ? "" : undefined}
      className={cn(selectTriggerVariants({ variant: v, onInverse }), className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <HugeiconsIcon
            icon={UnfoldMoreIcon}
            strokeWidth={2}
            className={cn(
              "pointer-events-none size-3.5",
              onInverse ? "text-on-inverse-muted-fg" : "text-muted-foreground"
            )}
          />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  onInverse: onInverseProp,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  > & { onInverse?: boolean }) {
  const ctxOnInverse = useSelectOnInverse()
  const onInverse = onInverseProp ?? ctxOnInverse
  const popupSurface = onInverse
    ? "rounded-lg bg-on-inverse-popover text-on-inverse-popover-fg shadow-xl ring-1 ring-on-inverse-popover-border"
    : "rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10"

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-on-inverse={onInverse ? "" : undefined}
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            popupSurface,
            className
          )}
          {...props}
        >
          <SelectScrollUpButton onInverse={onInverse} />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton onInverse={onInverse} />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  const onInverse = useSelectOnInverse()
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn(
        "px-2 py-1.5 text-xs",
        onInverse ? "text-on-inverse-muted-fg" : "text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  onInverse: onInverseProp,
  ...props
}: SelectPrimitive.Item.Props & { onInverse?: boolean }) {
  const ctxOnInverse = useSelectOnInverse()
  const onInverse = onInverseProp ?? ctxOnInverse
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-7 w-full cursor-default items-center gap-2 rounded-md px-2 py-1 text-xs/relaxed outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        onInverse
          ? "text-on-inverse-popover-fg focus:bg-on-inverse-surface-active focus:text-on-inverse-popover-fg not-data-[variant=destructive]:focus:**:text-on-inverse-popover-fg"
          : "focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex items-center justify-center" />
        }
      >
        <HugeiconsIcon
          icon={Tick02Icon}
          strokeWidth={2}
          className={cn(
            "pointer-events-none",
            onInverse ? "text-on-inverse-muted-fg" : undefined
          )}
        />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  const onInverse = useSelectOnInverse()
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        "pointer-events-none -mx-1 my-1 h-px",
        onInverse ? "bg-on-inverse-popover-border" : "bg-border/50",
        className
      )}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  onInverse: onInverseProp,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow> & {
  onInverse?: boolean
}) {
  const ctxOnInverse = useSelectOnInverse()
  const onInverse = onInverseProp ?? ctxOnInverse
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-3.5",
        onInverse
          ? "bg-on-inverse-popover text-on-inverse-muted-fg"
          : "bg-popover",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  onInverse: onInverseProp,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow> & {
  onInverse?: boolean
}) {
  const ctxOnInverse = useSelectOnInverse()
  const onInverse = onInverseProp ?? ctxOnInverse
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-3.5",
        onInverse
          ? "bg-on-inverse-popover text-on-inverse-muted-fg"
          : "bg-popover",
        className
      )}
      {...props}
    >
      <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  selectTriggerVariants,
}
