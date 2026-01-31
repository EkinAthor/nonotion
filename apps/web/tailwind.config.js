/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'notion-bg': '#ffffff',
        'notion-sidebar': '#f7f6f3',
        'notion-hover': '#ebebea',
        'notion-text': '#37352f',
        'notion-text-secondary': '#787774',
        'notion-border': '#e9e9e7',
      },
    },
  },
  plugins: [],
};
