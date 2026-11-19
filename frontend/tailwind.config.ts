import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f4efe2",
        surface: "#fffdf8",
        sand: "#eae1d0",
        rule: "#d9ccb4",
        muted: "#5d574d",
        signal: {
          DEFAULT: "#c23b2a",
          deep: "#8f291c",
          wash: "#f6dad3",
        },
        field: {
          DEFAULT: "#2e6b4f",
          wash: "#ddeBdf",
        },
        note: {
          DEFAULT: "#8c5a00",
          wash: "#f4e6bd",
        },
        route: {
          DEFAULT: "#2e6f72",
          wash: "#d8e7e3",
        },
        ink: {
          DEFAULT: "#171717",
          50: "#f7f2e7",
          100: "#ece3d4",
          200: "#d9ccb4",
          300: "#b8ad9c",
          400: "#8a8274",
          500: "#6b655a",
          600: "#5d574d",
          700: "#3d3a33",
          800: "#2b2923",
          900: "#171717",
        },
        brand: {
          50: "#f4efe2",
          100: "#eae1d0",
          200: "#d9ccb4",
          300: "#b8ad9c",
          600: "#c23b2a",
          700: "#171717",
          800: "#8f291c",
          900: "#171717",
        },
      },
      borderRadius: {
        control: "2px",
        card: "4px",
      },
      boxShadow: {
        overlay: "0 0 0 1px rgba(23, 23, 23, 0.12)",
        header: "0 1px 0 rgba(23, 23, 23, 0.06)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        "fade-up": "fade-up 200ms ease-out both",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;