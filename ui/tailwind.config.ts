import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#05070d",
        fg: "#e8eef5",
        dim: "#6b7385",
        rule: "#1a2233",
        accent: "#7ee8ff",
        warn: "#ffb547",
        alert: "#ff5e7a",
        metal: "#b18cff",
        green: "#8af0a7",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
      },
      letterSpacing: {
        caps: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
