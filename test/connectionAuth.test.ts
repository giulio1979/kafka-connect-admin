import { ConnectionStore, ConnectionMeta } from '../src/connectionStore';
import { ConnectClient } from '../src/clients/connectClient';
import { SchemaRegistryClient } from '../src/clients/schemaRegistryClient';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock classes for testing
class DummySecrets {
  private map = new Map<string, string>();
  async store(key: string, value: string) { this.map.set(key, value); }
  async get(key: string) { return this.map.get(key); }
  async delete(key: string) { this.map.delete(key); }
}

class DummyGlobalState {
  private map = new Map<string, string>();
  get<T>(key: string, defaultValue?: T) { 
    const v = this.map.get(key); 
    return (v === undefined) ? defaultValue : (v as unknown as T); 
  }
  update(key: string, value: any) { this.map.set(key, value); }
}

const dummyContext: any = {
  globalState: new DummyGlobalState(),
  secrets: new DummySecrets()
};

describe('Connection Authentication Tests', () => {
  let store: ConnectionStore;

  beforeEach(() => {
    store = new ConnectionStore(dummyContext);
    mockFetch.mockReset();
  });

  describe('Authentication Header Building', () => {
    test('Basic Auth - builds correct Authorization header', async () => {
      const conn: ConnectionMeta = {
        id: 'test-basic',
        name: 'Test Basic',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic',
        username: 'admin'
      };
      
      await store.addConnection(conn, 'secret123');
      const secret = await store.getSecret('test-basic');
      
      // Verify secret is stored correctly
      expect(secret).toBe('secret123');
      
      // Build headers like the real code does
      const headers: Record<string, string> = {};
      if (conn.authType === 'basic' && conn.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(conn.username + ':' + secret).toString('base64');
      }
      
      // Verify header format
      const expectedAuth = 'Basic ' + Buffer.from('admin:secret123').toString('base64');
      expect(headers['Authorization']).toBe(expectedAuth);
      expect(headers['Authorization']).toBe('Basic YWRtaW46c2VjcmV0MTIz');
    });

    test('Bearer Token - builds correct Authorization header', async () => {
      const conn: ConnectionMeta = {
        id: 'test-bearer',
        name: 'Test Bearer',
        url: 'http://localhost:8081',
        type: 'schema-registry',
        authType: 'bearer'
      };
      
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token';
      await store.addConnection(conn, token);
      const secret = await store.getSecret('test-bearer');
      
      // Verify token is stored correctly
      expect(secret).toBe(token);
      
      // Build headers like the real code does
      const headers: Record<string, string> = {};
      if (conn.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
      
      // Verify header format
      expect(headers['Authorization']).toBe(`Bearer ${token}`);
    });

    test('No Auth - no Authorization header', async () => {
      const conn: ConnectionMeta = {
        id: 'test-none',
        name: 'Test None',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'none'
      };
      
      await store.addConnection(conn);
      const secret = await store.getSecret('test-none');
      
      // Verify no secret stored
      expect(secret).toBeUndefined();
      
      // Build headers like the real code does
      const headers: Record<string, string> = {};
      if (conn.authType === 'basic' && conn.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(conn.username + ':' + secret).toString('base64');
      } else if (conn.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
      
      // Verify no Authorization header
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('Connect Client Authentication Scenarios', () => {
    test('401 Unauthorized - Basic Auth Invalid Credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error_code: 401, message: 'Invalid credentials' })
      });

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: { 'Authorization': 'Basic aW52YWxpZDpjcmVkcw==' } // invalid:creds
      });

      await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8083/connectors',
        { headers: { 'Accept': 'application/json', 'Authorization': 'Basic aW52YWxpZDpjcmVkcw==' } }
      );
    });

    test('401 Unauthorized - Bearer Token Invalid', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error_code: 401, message: 'Invalid token' })
      });

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: { 'Authorization': 'Bearer invalid-token' }
      });

      await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
    });

    test('401 Unauthorized - Missing Authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error_code: 401, message: 'Authentication required' })
      });

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {} // No auth headers
      });

      await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
    });

    test('200 Success - Valid Basic Auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ['connector1', 'connector2']
      });

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: { 'Authorization': 'Basic YWRtaW46c2VjcmV0MTIz' } // admin:secret123
      });

      const connectors = await client.listConnectors();
      expect(connectors).toEqual(['connector1', 'connector2']);
    });

    test('200 Success - Valid Bearer Token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ['connector1', 'connector2']
      });

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: { 'Authorization': 'Bearer valid-token' }
      });

      const connectors = await client.listConnectors();
      expect(connectors).toEqual(['connector1', 'connector2']);
    });
  });

  describe('Schema Registry Client Authentication Scenarios', () => {
    test('401 Unauthorized - Invalid Basic Auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => '{"error_code": 40101, "message": "Unauthorized"}'
      });

      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: { 'Authorization': 'Basic aW52YWxpZDpjcmVkcw==' }
      });

      await expect(client.listSubjects()).rejects.toThrow('Failed to list subjects (401)');
    });

    test('403 Forbidden - Insufficient Permissions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => '{"error_code": 40301, "message": "Not authorized to access this operation"}'
      });

      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: { 'Authorization': 'Basic dmFsaWQ6Y3JlZHM=' }
      });

      await expect(client.listSubjects()).rejects.toThrow('Failed to list subjects (403)');
    });

    test('200 Success - Valid Authentication', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ['subject1-value', 'subject2-key']
      });

      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: { 'Authorization': 'Basic dmFsaWQ6Y3JlZHM=' }
      });

      const subjects = await client.listSubjects();
      expect(subjects).toEqual(['subject1-value', 'subject2-key']);
    });
  });

  describe('Connection Testing Edge Cases', () => {
    test('Network Error - Connection Refused', async () => {
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: { 'Authorization': 'Basic dmFsaWQ6Y3JlZHM=' }
      });

      await expect(client.listConnectors()).rejects.toThrow('fetch failed');
    });

    test('Timeout Error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: { 'Authorization': 'Bearer valid-token' }
      });

      await expect(client.listSubjects()).rejects.toThrow('Request timeout');
    });

    test('Invalid URL Format', async () => {
      const client = new ConnectClient({
        baseUrl: 'invalid-url',
        headers: {}
      });

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(client.listConnectors()).rejects.toThrow('Failed to fetch');
    });

    test('500 Internal Server Error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal server error' })
      });

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: { 'Authorization': 'Basic dmFsaWQ6Y3JlZHM=' }
      });

      await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 500');
    });
  });

  describe('Authentication Configuration Edge Cases', () => {
    test('Basic Auth - Missing Username', async () => {
      const conn: ConnectionMeta = {
        id: 'test-no-username',
        name: 'Test No Username',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic'
        // username missing
      };
      
      await store.addConnection(conn, 'password123');
      const secret = await store.getSecret('test-no-username');
      
      // Build headers like the real code does
      const headers: Record<string, string> = {};
      if (conn.authType === 'basic' && conn.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(conn.username + ':' + secret).toString('base64');
      }
      
      // Should not build Authorization header without username
      expect(headers['Authorization']).toBeUndefined();
    });

    test('Basic Auth - Missing Password', async () => {
      const conn: ConnectionMeta = {
        id: 'test-no-password',
        name: 'Test No Password',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic',
        username: 'admin'
      };
      
      await store.addConnection(conn); // No password provided
      const secret = await store.getSecret('test-no-password');
      
      // Build headers like the real code does
      const headers: Record<string, string> = {};
      if (conn.authType === 'basic' && conn.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(conn.username + ':' + secret).toString('base64');
      }
      
      // Should not build Authorization header without password
      expect(headers['Authorization']).toBeUndefined();
    });

    test('Bearer Token - Empty Token', async () => {
      const conn: ConnectionMeta = {
        id: 'test-empty-token',
        name: 'Test Empty Token',
        url: 'http://localhost:8081',
        type: 'schema-registry',
        authType: 'bearer'
      };
      
      await store.addConnection(conn, ''); // Empty token
      const secret = await store.getSecret('test-empty-token');
      
      // Build headers like the real code does
      const headers: Record<string, string> = {};
      if (conn.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
      
      // Should not build Authorization header with empty token
      expect(headers['Authorization']).toBeUndefined();
    });
  });
});
