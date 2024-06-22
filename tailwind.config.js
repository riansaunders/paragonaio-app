const defaultTheme = require("tailwindcss/defaultTheme");

module.exports = {
  mode: "jit",
  purge: ["./src/ui/**/*.tsx"],
  // purge: [],
  darkMode: "media", // or 'media' or 'class'
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter var", ...defaultTheme.fontFamily.sans],
      },
    },
  },

  variants: {
    extend: {},
  },
  plugins: [],
};
