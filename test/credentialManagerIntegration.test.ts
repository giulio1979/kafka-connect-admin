import { CredentialManagerIntegration } from '../src/credentialManagerIntegration';

// Use the existing vscode mock from __mocks__/vscode.js
const vscode = require('vscode');

describe('CredentialManagerIntegration', () => {
  let credentialManager: CredentialManagerIntegration;
  let mockContext: any;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a mock context using the existing ExtensionContext mock
    mockContext = new vscode.ExtensionContext();
    
    // Setup workspace configuration mock
    vscode.workspace.getConfiguration = jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue([])
    });
    
    credentialManager = new CredentialManagerIntegration(mockContext);
  });

  test('should initialize without errors', () => {
    expect(credentialManager).toBeDefined();
  });

  test('should handle empty connections list', async () => {
    const connections = await credentialManager.listConnections();
    expect(Array.isArray(connections)).toBe(true);
    expect(connections.length).toBe(0);
  });

  test('should check if credential manager is available', async () => {
    // Mock extension not found
    vscode.extensions.getExtension.mockReturnValue(undefined);
    
    const isAvailable = await credentialManager.isCredentialManagerAvailable();
    expect(typeof isAvailable).toBe('boolean');
    expect(isAvailable).toBe(false);
  });

  test('should check if credential manager is available when extension exists', async () => {
    // Mock extension found and active
    vscode.extensions.getExtension.mockReturnValue({ 
      id: 'test',
      isActive: true,
      activate: jest.fn().mockResolvedValue(undefined),
      exports: {
        getCredential: jest.fn(),
        setCredential: jest.fn(),
        deleteCredential: jest.fn(),
        listCredentials: jest.fn()
      }
    });
    
    const isAvailable = await credentialManager.isCredentialManagerAvailable();
    expect(isAvailable).toBe(true);
  });

  test('should build empty auth headers for connection without auth', async () => {
    const connection = {
      id: 'test-id',
      name: 'Test Connection',
      url: 'http://localhost:8083',
      type: 'connect' as const,
      authType: 'none' as const
    };

    const headers = await credentialManager.buildAuthHeaders(connection);
    expect(headers).toEqual({});
  });

  test('should get undefined secret for non-existent connection', async () => {
    // Mock the credential manager extension
    const mockAPI = {
      getCredential: jest.fn().mockResolvedValue(undefined),
      setCredential: jest.fn(),
      deleteCredential: jest.fn(),
      listCredentials: jest.fn()
    };
    
    vscode.extensions.getExtension.mockReturnValue({
      id: 'test',
      isActive: true,
      activate: jest.fn().mockResolvedValue(undefined),
      exports: mockAPI
    });
    
    await credentialManager.initialize();
    const secret = await credentialManager.getCredential('non-existent-id');
    expect(secret).toBeUndefined();
  });

  test('should build basic auth headers when username and secret are available', async () => {
    const connection = {
      id: 'test-id',
      name: 'Test Connection',
      url: 'http://localhost:8083',
      type: 'connect' as const,
      authType: 'basic' as const,
      username: 'testuser'
    };

    // Mock the credential manager extension API
    const mockAPI = {
      getCredential: jest.fn().mockResolvedValue('testpassword'),
      setCredential: jest.fn(),
      deleteCredential: jest.fn(),
      listCredentials: jest.fn()
    };
    
    vscode.extensions.getExtension.mockReturnValue({
      id: 'test',
      isActive: true,
      activate: jest.fn().mockResolvedValue(undefined),
      exports: mockAPI
    });
    
    await credentialManager.initialize();
    const headers = await credentialManager.buildAuthHeaders(connection);
    expect(headers).toHaveProperty('Authorization');
    expect(headers.Authorization).toBe('Basic ' + Buffer.from('testuser:testpassword').toString('base64'));
  });

  test('should build bearer auth headers when secret is available', async () => {
    const connection = {
      id: 'test-id',
      name: 'Test Connection',
      url: 'http://localhost:8083',
      type: 'connect' as const,
      authType: 'bearer' as const
    };

    // Mock the credential manager extension API
    const mockAPI = {
      getCredential: jest.fn().mockResolvedValue('testtoken'),
      setCredential: jest.fn(),
      deleteCredential: jest.fn(),
      listCredentials: jest.fn()
    };
    
    vscode.extensions.getExtension.mockReturnValue({
      id: 'test',
      isActive: true,
      activate: jest.fn().mockResolvedValue(undefined),
      exports: mockAPI
    });
    
    await credentialManager.initialize();
    const headers = await credentialManager.buildAuthHeaders(connection);
    expect(headers).toHaveProperty('Authorization');
    expect(headers.Authorization).toBe('Bearer testtoken');
  });
});
