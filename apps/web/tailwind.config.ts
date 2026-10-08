import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17211d",
        mint: "#d8f3dc",
        river: "#2f6f73",
        saffron: "#e8a13a",
      },
    },
  },
  plugins: [],
};

export default config;
