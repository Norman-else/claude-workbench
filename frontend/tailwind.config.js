/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef8ee',
          100: '#fdf0d7',
          200: '#fadbae',
          300: '#f7c17b',
          400: '#f39c46',
          500: '#f07d1f',
          600: '#e16315',
          700: '#bb4a14',
          800: '#953a18',
          900: '#793116',
        }
      }
    },
  },
  plugins: [],
}

