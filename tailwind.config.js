/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Fraunces', 'serif'],
      },
      colors: {
        brand: {
          50:  '#f0f7ff',
          100: '#e0effe',
          200: '#baddfd',
          400: '#60a9f8',
          600: '#2563eb',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        night: {
          50:  '#fefce8',
          200: '#fef08a',
          400: '#facc15',
          600: '#ca8a04',
          800: '#854d0e',
        }
      }
    },
  },
  plugins: [],
}
