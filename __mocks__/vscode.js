// Mock for vscode module in Jest tests

const vscode = {
  ExtensionContext: class MockExtensionContext {
    constructor() {
      this.globalState = {
        get: jest.fn((key, defaultValue) => defaultValue),
        update: jest.fn()
      };
      this.secrets = {
        store: jest.fn(),
        get: jest.fn(),
        delete: jest.fn()
      };
      this.subscriptions = [];
    }
  },

  Disposable: class MockDisposable {
    dispose() {}
  },

  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
      dispose: jest.fn()
    }))
  },

  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
      has: jest.fn()
    }))
  },

  commands: {
    registerCommand: jest.fn()
  },

  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  },

  StatusBarAlignment: {
    Left: 1,
    Right: 2
  },

  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3
  },

  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2
  }
};

module.exports = vscode;
