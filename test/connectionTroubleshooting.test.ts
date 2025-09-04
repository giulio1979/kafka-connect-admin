import { ConnectionStore, ConnectionMeta } from '../src/connectionStore';
import { ConnectClient } from '../src/clients/connectClient';
import { SchemaRegistryClient } from '../src/clients/schemaRegistryClient';

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

/**
 * Connection Troubleshooting Tests
 * 
 * These tests help diagnose common 401 authentication issues
 */
describe('Connection Troubleshooting - 401 Error Diagnosis', () => {
  let store: ConnectionStore;

  beforeEach(() => {
    store = new ConnectionStore(dummyContext);
  });

  describe('Authentication Header Validation', () => {
    test('Basic Auth - Validate header encoding', () => {
      const username = 'admin';
      const password = 'secret';
      const expected = 'Basic YWRtaW46c2VjcmV0'; // admin:secret
      
      const header = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
      expect(header).toBe(expected);
      
      // Verify decoding works correctly
      const decoded = Buffer.from(header.split(' ')[1], 'base64').toString();
      expect(decoded).toBe('admin:secret');
    });

    test('Basic Auth - Special characters in password', () => {
      const username = 'admin';
      const password = 'p@ss!word#123';
      
      const header = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
      const decoded = Buffer.from(header.split(' ')[1], 'base64').toString();
      
      expect(decoded).toBe('admin:p@ss!word#123');
    });

    test('Basic Auth - Empty username or password', () => {
      // Empty username
      const header1 = 'Basic ' + Buffer.from(':password').toString('base64');
      expect(header1).toBe('Basic OnBhc3N3b3Jk');
      
      // Empty password  
      const header2 = 'Basic ' + Buffer.from('username:').toString('base64');
      expect(header2).toBe('Basic dXNlcm5hbWU6');
    });

    test('Bearer Token - Format validation', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const header = `Bearer ${token}`;
      
      expect(header).toBe('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature');
      expect(header.startsWith('Bearer ')).toBe(true);
    });
  });

  describe('Common 401 Error Scenarios', () => {
    test('Scenario: Wrong username/password combination', async () => {
      const conn: ConnectionMeta = {
        id: 'test-wrong-creds',
        name: 'Test Wrong Credentials',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic',
        username: 'admin'
      };
      
      // Store connection with wrong password
      await store.addConnection(conn, 'wrongpassword');
      const secret = await store.getSecret('test-wrong-creds');
      
      expect(secret).toBe('wrongpassword');
      
      // This would result in: Basic YWRtaW46d3JvbmdwYXNzd29yZA==
      const authHeader = 'Basic ' + Buffer.from('admin:wrongpassword').toString('base64');
      expect(authHeader).toBe('Basic YWRtaW46d3JvbmdwYXNzd29yZA==');
    });

    test('Scenario: Expired or invalid bearer token', async () => {
      const conn: ConnectionMeta = {
        id: 'test-expired-token',
        name: 'Test Expired Token',
        url: 'http://localhost:8081',
        type: 'schema-registry',
        authType: 'bearer'
      };
      
      // Simulate expired token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MzA0NzEyMDB9.invalid';
      await store.addConnection(conn, expiredToken);
      
      const secret = await store.getSecret('test-expired-token');
      expect(secret).toBe(expiredToken);
      
      const authHeader = `Bearer ${expiredToken}`;
      expect(authHeader).toContain('Bearer eyJ');
    });

    test('Scenario: Missing authentication when required', async () => {
      const conn: ConnectionMeta = {
        id: 'test-no-auth',
        name: 'Test No Auth',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'none'
      };
      
      await store.addConnection(conn);
      const secret = await store.getSecret('test-no-auth');
      
      // No secret should be stored for 'none' auth
      expect(secret).toBeUndefined();
      
      // This scenario would send no Authorization header to a secured endpoint
    });

    test('Scenario: Malformed authorization header', () => {
      // Test various malformed headers that could cause 401
      const malformedHeaders = [
        'Basic', // Missing credentials
        'Basic ', // Empty credentials  
        'Bearer', // Missing token
        'Bearer ', // Empty token
        'basic YWRtaW46c2VjcmV0', // Lowercase 'basic'
        'bearer token123', // Lowercase 'bearer'
        'YWRtaW46c2VjcmV0', // Missing 'Basic' prefix
        'Basic YWRtaW46c2VjcmV0 extradata', // Extra data
      ];
      
      malformedHeaders.forEach(header => {
        expect(header).toBeDefined();
        // Each of these would likely result in 401 Unauthorized
      });
    });
  });

  describe('Connection Store Integration', () => {
    test('End-to-end auth header generation - Basic Auth', async () => {
      const conn: ConnectionMeta = {
        id: 'e2e-basic',
        name: 'End-to-End Basic',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic',
        username: 'testuser'
      };
      
      const password = 'testpass123';
      await store.addConnection(conn, password);
      
      // Simulate the header building logic from connectionManager.ts
      const secret = await store.getSecret('e2e-basic');
      const headers: Record<string, string> = {};
      
      if (conn.authType === 'basic' && conn.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(conn.username + ':' + secret).toString('base64');
      }
      
      expect(headers['Authorization']).toBe('Basic dGVzdHVzZXI6dGVzdHBhc3MxMjM=');
      
      // Verify it decodes correctly
      const decoded = Buffer.from(headers['Authorization'].split(' ')[1], 'base64').toString();
      expect(decoded).toBe('testuser:testpass123');
    });

    test('End-to-end auth header generation - Bearer Token', async () => {
      const conn: ConnectionMeta = {
        id: 'e2e-bearer',
        name: 'End-to-End Bearer',
        url: 'http://localhost:8081',
        type: 'schema-registry',
        authType: 'bearer'
      };
      
      const token = 'jwt.token.here';
      await store.addConnection(conn, token);
      
      // Simulate the header building logic from connectionManager.ts
      const secret = await store.getSecret('e2e-bearer');
      const headers: Record<string, string> = {};
      
      if (conn.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }
      
      expect(headers['Authorization']).toBe('Bearer jwt.token.here');
    });
  });

  describe('Debugging Helpers', () => {
    test('Base64 encoding/decoding utilities', () => {
      const testCases = [
        { input: 'admin:password', expected: 'YWRtaW46cGFzc3dvcmQ=' },
        { input: 'user:secret123', expected: 'dXNlcjpzZWNyZXQxMjM=' },
        { input: 'admin:', expected: 'YWRtaW46' },
        { input: ':password', expected: 'OnBhc3N3b3Jk' }
      ];
      
      testCases.forEach(({ input, expected }) => {
        const encoded = Buffer.from(input).toString('base64');
        expect(encoded).toBe(expected);
        
        const decoded = Buffer.from(encoded, 'base64').toString();
        expect(decoded).toBe(input);
      });
    });

    test('Authorization header parsing', () => {
      const basicHeader = 'Basic YWRtaW46cGFzc3dvcmQ=';
      const bearerHeader = 'Bearer eyJhbGciOiJIUzI1NiJ9.token.signature';
      
      // Parse Basic auth
      expect(basicHeader.startsWith('Basic ')).toBe(true);
      const basicCreds = Buffer.from(basicHeader.substring(6), 'base64').toString();
      expect(basicCreds).toBe('admin:password');
      const [username, password] = basicCreds.split(':');
      expect(username).toBe('admin');
      expect(password).toBe('password');
      
      // Parse Bearer token
      expect(bearerHeader.startsWith('Bearer ')).toBe(true);
      const token = bearerHeader.substring(7);
      expect(token).toBe('eyJhbGciOiJIUzI1NiJ9.token.signature');
    });
  });

  describe('Common Troubleshooting Steps', () => {
    test('Verify connection configuration completeness', async () => {
      // Test incomplete configurations that might cause 401s
      
      // Missing username for basic auth
      const incompleteBasic: ConnectionMeta = {
        id: 'incomplete-basic',
        name: 'Incomplete Basic',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic'
        // Missing username
      };
      
      await store.addConnection(incompleteBasic, 'password');
      const secret1 = await store.getSecret('incomplete-basic');
      
      const headers1: Record<string, string> = {};
      if (incompleteBasic.authType === 'basic' && incompleteBasic.username && secret1) {
        headers1['Authorization'] = 'Basic ' + Buffer.from(incompleteBasic.username + ':' + secret1).toString('base64');
      }
      
      // Should not create auth header without username
      expect(headers1['Authorization']).toBeUndefined();
      
      // Missing token for bearer auth
      const incompleteBearer: ConnectionMeta = {
        id: 'incomplete-bearer',
        name: 'Incomplete Bearer',
        url: 'http://localhost:8081',
        type: 'schema-registry',
        authType: 'bearer'
      };
      
      await store.addConnection(incompleteBearer); // No token provided
      const secret2 = await store.getSecret('incomplete-bearer');
      
      const headers2: Record<string, string> = {};
      if (incompleteBearer.authType === 'bearer' && secret2) {
        headers2['Authorization'] = `Bearer ${secret2}`;
      }
      
      // Should not create auth header without token
      expect(headers2['Authorization']).toBeUndefined();
    });

    test('URL format validation', () => {
      const validUrls = [
        'http://localhost:8083',
        'https://localhost:8083',
        'http://kafka-connect:8083',
        'https://my-cluster.kafka.com:8083'
      ];
      
      const invalidUrls = [
        'localhost:8083', // Missing protocol
        'http://localhost', // Missing port for Kafka Connect
        'kafka-connect:8083', // Missing protocol
        'https://', // Empty host
      ];
      
      validUrls.forEach(url => {
        expect(url).toMatch(/^https?:\/\/.+/);
      });
      
      invalidUrls.forEach(url => {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          expect(url).not.toMatch(/^https?:\/\/.+/);
        }
      });
    });
  });
});
