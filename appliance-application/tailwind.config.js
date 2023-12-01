/** @type {import('tailwindcss').Config} */
const mode = (process.env.MODE = process.env.MODE || 'development');

const contentDir = (mode === 'development' ? './packages/' : './');

module.exports = {
  content: [contentDir+'**/*.{html,vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

