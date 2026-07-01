/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEach: undefined,
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
  clearMocks: true,
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
        // Transpile-only: don't let type-checking (or rootDir) block tests.
        isolatedModules: true,
        diagnostics: false,
      },
    ],
  },
};
