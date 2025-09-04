module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
