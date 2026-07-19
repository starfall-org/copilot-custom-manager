module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  moduleNameMapper: {
    '^vscode$': '<rootDir>/tests/mocks/vscode.ts'
  }
};
