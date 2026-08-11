// Babel config used only for Jest to transform TypeScript sources.
// The production build uses `tsc` (see package.json build script); Babel is
// not involved there.
module.exports = {
  presets: [
    '@babel/preset-typescript',
    // Component tests import .tsx sources; the automatic runtime means they do
    // not need React in scope.
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
  plugins: [
    // Jest needs CommonJS modules; sources use ESM import/export.
    '@babel/plugin-transform-modules-commonjs',
  ],
};
