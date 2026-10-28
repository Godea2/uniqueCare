import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          "primary-dark": "var(--brand-primary-dark)",
          secondary: "var(--brand-secondary)",
          soft: "var(--brand-soft)",
        },
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        line: "var(--border)",
        success: "var(--success)",
        error: "var(--error)",
        "cqc-good": "var(--cqc-good)",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: { content: "76rem" },
      borderRadius: { card: "1rem" },
      boxShadow: {
        card: "0 1px 2px rgb(16 24 40 / 0.06), 0 4px 16px rgb(16 24 40 / 0.08)",
        "card-hover": "0 4px 8px rgb(16 24 40 / 0.08), 0 12px 32px rgb(16 24 40 / 0.14)",
      },
    },
  },
  plugins: [],
};

export default config;
