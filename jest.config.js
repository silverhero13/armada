module.exports = {
  clearMocks: true,
  coverageDirectory: '../coverage',
  moduleFileExtensions: ['js', 'json', 'ts'],
  coveragePathIgnorePatterns: ['/.serverless/'],
  preset: 'ts-jest',
  rootDir: './services',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.serverless/'],
  verbose: true,
}