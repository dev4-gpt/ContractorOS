/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './product/index.html', './pricing/index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#080C14',
          card: '#0F1626',
          border: '#1E293B',
          cyan: '#06B6D4',
          emerald: '#10B981',
          violet: '#8B5CF6'
        }
      }
    }
  },
  plugins: []
};
