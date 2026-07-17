// Babel config used only for Jest to transform TypeScript sources.
// The production build uses `tsc` (see package.json build script); Babel is
// not involved there.
module.exports = {
  presets: [
    '@babel/preset-typescript',
  ],
  plugins: [
    // Jest needs CommonJS modules; sources use ESM import/export.
    '@babel/plugin-transform-modules-commonjs',
  ],
};
