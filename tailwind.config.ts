import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: "#faf7f2", dark: "#2a2825" },
        ink: { DEFAULT: "#1c1917", muted: "#57534e" },
        sage: { DEFAULT: "#5c6b4a", light: "#8a9a7a" },
        cream: "#f5f0e8",
        accent: "#b45309",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
} satisfies Config;
