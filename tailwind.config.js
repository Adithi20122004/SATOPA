/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        police: {
          50: '#f0f5fa',
          100: '#dde9f4',
          500: '#1b4d7e',
          700: '#0f2c4d',
          800: '#0b1d33',
          900: '#06101c',
        },
        mha: {
          gold: '#d4af37',
          amber: '#f59e0b',
        }
      },
    },
  },
  plugins: [],
}
