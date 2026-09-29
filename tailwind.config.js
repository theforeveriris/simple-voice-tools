/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 莫奈动态色板（rgb 三元组变量，支持透明度修饰符）
        surface: "rgb(var(--c-surface-rgb) / <alpha-value>)",
        card: "rgb(var(--c-card-rgb) / <alpha-value>)",
        "surface-hi": "rgb(var(--c-surface-hi-rgb) / <alpha-value>)",
        ink: "rgb(var(--c-ink-rgb) / <alpha-value>)",
        "ink-2": "rgb(var(--c-ink-2-rgb) / <alpha-value>)",
        accent: "rgb(var(--c-accent-rgb) / <alpha-value>)",
        "on-accent": "rgb(var(--c-on-accent-rgb) / <alpha-value>)",
        "accent-soft": "rgb(var(--c-accent-soft-rgb) / <alpha-value>)",
        "on-accent-soft": "rgb(var(--c-on-accent-soft-rgb) / <alpha-value>)",
        accent2: "rgb(var(--c-accent2-rgb) / <alpha-value>)",
        "accent2-soft": "rgb(var(--c-accent2-soft-rgb) / <alpha-value>)",
        "on-accent2-soft": "rgb(var(--c-on-accent2-soft-rgb) / <alpha-value>)",
        line: "rgb(var(--c-line-rgb) / <alpha-value>)",

        // shadcn/radix 组件使用的传统语义色
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
