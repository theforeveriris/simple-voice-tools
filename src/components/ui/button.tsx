import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary/80 text-primary-foreground hover:bg-primary/90 backdrop-blur-md border border-white/20 shadow-lg shadow-primary/20 hover:shadow-primary/30",
        destructive:
          "bg-destructive/80 text-white hover:bg-destructive/90 backdrop-blur-md border border-destructive/30 shadow-lg shadow-destructive/20 hover:shadow-destructive/30 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-white/20 bg-white/10 dark:bg-black/20 hover:bg-white/20 dark:hover:bg-black/30 backdrop-blur-md shadow-lg hover:shadow-xl transition-all duration-300",
        secondary:
          "bg-secondary/80 text-secondary-foreground hover:bg-secondary/90 backdrop-blur-md border border-white/20 shadow-lg hover:shadow-xl",
        ghost:
          "hover:bg-accent/50 dark:hover:bg-accent/30 backdrop-blur-md transition-all duration-300",
        link: "text-primary underline-offset-4 hover:underline",
        subtle: "text-foreground hover:text-primary hover:bg-accent/20 dark:hover:bg-accent/10 transition-all duration-300",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        sm: "h-9 rounded-lg gap-1.5 px-4 has-[>svg]:px-3",
        lg: "h-11 rounded-lg px-7 has-[>svg]:px-5",
        icon: "size-10",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// variants 常量随组件导出为 shadcn 惯例，豁免 fast-refresh 规则
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
