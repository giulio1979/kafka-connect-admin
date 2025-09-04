// Jest setup - configure mocks

// Mock the vscode module
jest.mock('vscode', () => require('./__mocks__/vscode.js'), { virtual: true });
