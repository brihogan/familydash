/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          // 800/900 continue the indigo ramp. They exist because ~28 call sites
          // across the app already use `dark:bg-brand-900/20`, `text-brand-800`
          // and friends — Tailwind emits nothing for an undefined shade, so
          // those classes silently did nothing and the element kept its light
          // `bg-brand-50` in dark mode, rendering as a washed-out light box.
          800: '#3730a3',
          900: '#312e81',
        },
      },
    },
  },
  plugins: [],
};
