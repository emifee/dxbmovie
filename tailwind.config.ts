import type { Config } from "tailwindcss";

// DXBmovies design tokens — single source of truth for the dark cinematic
// theme. Colors map 1:1 to the spec so component classes stay semantic
// (bg-surface, border-border, text-secondary, etc.).
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        surface: {
          DEFAULT: "#111111",
          raised: "#1A1A1A",
          bubble: "#1E1E1E", // AI chat bubble
        },
        border: {
          DEFAULT: "#2A2A2A",
        },
        primary: {
          DEFAULT: "rgb(var(--color-primary-rgb) / <alpha-value>)",
          pink: "#EC4899",
        },
        text: {
          primary: "#FFFFFF",
          secondary: "#9CA3AF",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        // Subtle glow on focused inputs / hovered cards using dynamic rgb variable
        glow: "0 0 20px rgba(var(--color-primary-rgb), 0.15)",
        "glow-lg": "0 0 40px rgba(var(--color-primary-rgb), 0.25)",
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, var(--color-primary) 0%, #EC4899 100%)",
      },
      maxWidth: {
        app: "430px", // mobile-first centered container
      },
      keyframes: {
        "orb-pulse": {
          "0%, 100%": { transform: "scale(1)", opacity: "0.9" },
          "50%": { transform: "scale(1.08)", opacity: "1" },
        },
        "orb-rotate": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "message-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "caret-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "ball-pulse": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.8)" },
        },
        "text-vibrate": {
          "0%, 100%": { transform: "translate(0, 0)" },
          "20%": { transform: "translate(0.5px, -0.5px)" },
          "40%": { transform: "translate(-0.5px, 0.5px)" },
          "60%": { transform: "translate(0.5px, 0.5px)" },
          "80%": { transform: "translate(-0.5px, -0.5px)" },
        },
        "pulse-glow": {
          "0%, 100%": {
            boxShadow: "0 0 15px rgba(var(--color-primary-rgb), 0.3)",
            borderColor: "rgba(var(--color-primary-rgb), 0.4)",
          },
          "50%": {
            boxShadow: "0 0 25px rgba(var(--color-primary-rgb), 0.5)",
            borderColor: "rgba(var(--color-primary-rgb), 0.6)",
          },
        },
      },
      animation: {
        "orb-pulse": "orb-pulse 4s ease-in-out infinite",
        "orb-rotate": "orb-rotate 18s linear infinite",
        "slide-up": "slide-up 300ms ease-out",
        "slide-in-left": "slide-in-left 300ms ease-out",
        "slide-in-right": "slide-in-right 300ms ease-out",
        "fade-in": "fade-in 300ms ease-out",
        "message-in": "message-in 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "caret-blink": "caret-blink 1s ease-in-out infinite",
        "ball-pulse": "ball-pulse 1s ease-in-out infinite",
        "text-vibrate": "text-vibrate 0.3s linear infinite",
        "pulse-glow": "pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
