/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  // next/server ships ESM; allow it (and jose) to be transformed too.
  transformIgnorePatterns: ['/node_modules/(?!(.*next|jose)/)'],
  clearMocks: true,
};
