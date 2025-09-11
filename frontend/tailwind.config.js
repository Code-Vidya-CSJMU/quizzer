/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      gradientColorStops: theme => ({
        'brand-start': theme('colors.indigo.50'),
        'brand-end': theme('colors.white'),
      }),
    },
  },
  plugins: [],
}
