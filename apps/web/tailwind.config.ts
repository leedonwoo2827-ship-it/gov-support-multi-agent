import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gov: {
          blue: "#003478",
          accent: "#0073e6",
          bg: "#f5f7fa",
          ink: "#1a1a1a",
          line: "#dde2e8",
        },
      },
      fontFamily: {
        sans: ["Pretendard", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
