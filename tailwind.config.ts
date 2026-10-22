import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#EAF6FF",
          100: "#D3ECFF",
          400: "#5FA8E8",
          600: "#2E7BC4",
          800: "#1B4E80",
        },
        accent: {
          DEFAULT: "#FFB454",
          dark: "#F0932B",
          100: "#FFF1DD",
        },
        ink: "#1F2A37",
        muted: "#66748C",
        line: "#DCEAF7",
        success: {
          DEFAULT: "#22B573",
          bg: "#E4F8EE",
        },
        danger: {
          DEFAULT: "#E3543F",
          bg: "#FDEAE7",
        },
      },
      borderRadius: {
        DEFAULT: "16px",
        sm: "10px",
      },
    },
  },
  plugins: [],
};
export default config;
