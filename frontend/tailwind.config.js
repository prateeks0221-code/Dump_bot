/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        desk: {
          bg: '#0f0f11',
          card: '#1a1a1e',
          border: '#27272a',
          text: '#e4e4e7',
          muted: '#a1a1aa',
          accent: '#60a5fa',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
