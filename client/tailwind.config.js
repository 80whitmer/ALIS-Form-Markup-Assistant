module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ALIS brand colors
        alis: {
          blue: '#1e3a8a',
          light: '#3b82f6',
          accent: '#0ea5e9',
        }
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
