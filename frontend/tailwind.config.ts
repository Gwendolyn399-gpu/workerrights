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
        brand: {
          50: "#eef4fb",
          100: "#d9e7f6",
          200: "#b7d1ec",
          300: "#8ab4dd",
          400: "#4f8ec7",
          500: "#2f6fae",
          600: "#1f5794",
          700: "#17457a",
          800: "#123a66",
          900: "#0e2f54",
          950: "#081e38"
        },
        ink: {
          50: "#f7f9fc",
          100: "#eef2f7",
          200: "#dde4ee",
          300: "#c3cedd",
          400: "#8d9bb3",
          500: "#64748b",
          600: "#475569",
          700: "#334155",
          800: "#1e293b",
          900: "#0f172a"
        },
        accent: {
          50: "#fff7ed",
          100: "#ffedd5",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c"
        }
      },
      boxShadow: {
        card: "0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.12)",
        lift: "0 12px 32px -12px rgba(14, 47, 84, 0.22)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" }
        },
        "sheet-in": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-up": "fade-up 280ms ease-out both",
        "pulse-dot": "pulse-dot 1.4s ease-in-out infinite",
        "sheet-in": "sheet-in 220ms ease-out both"
      }
    }
  },
  plugins: []
};

export default config;
