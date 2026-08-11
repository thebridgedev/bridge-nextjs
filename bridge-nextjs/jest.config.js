/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  // next/server ships ESM; allow it (and jose, and auth-core — `"type":
  // "module"`) to be transformed too.
  transformIgnorePatterns: ['/node_modules/(?!(.*next|jose|@nebulr-group)/)'],
  clearMocks: true,
};
