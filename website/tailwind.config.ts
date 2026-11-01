import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--brand-primary)",
          "primary-dark": "var(--brand-primary-dark)",
          secondary: "var(--brand-secondary)",
          soft: "var(--brand-soft)",
          ink: "var(--brand-ink)",
          gold: "var(--brand-gold)",
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
        heading: ["var(--font-heading)", "var(--font-body)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: { content: "76rem" },
      borderRadius: { card: "var(--radius-xl)", xl: "var(--radius-xl)" },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-lift)",
        lift: "var(--shadow-lift)",
      },
    },
  },
  plugins: [],
};

export default config;
