import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        chanv: {
          blanc: "#FFFFFF",
          beige: "#DDCBA4",
          fibre: "#F1EADA",
          terre: "#282828",
        },
        brand: {
          50: "#FBF8F0",
          100: "#F1EADA",
          200: "#E8DDC2",
          300: "#DDCBA4",
          400: "#C9B585",
          500: "#B89E66",
          600: "#8A7648",
          700: "#5E5031",
          900: "#282828",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-outfit)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        chanv: "20px",
      },
      boxShadow: {
        "chanv-soft": "0 4px 20px rgba(40, 40, 40, 0.05)",
        "chanv-bold": "0 12px 40px rgba(40, 40, 40, 0.1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
