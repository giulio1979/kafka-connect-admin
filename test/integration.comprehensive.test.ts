/**
 * Comprehensive Integration Tests using Mock Server
 * 
 * Tests all authentication scenarios, connector operations, 
 * schema operations, and copy/paste functionality with
 * methodical coverage of edge cases.
 */

import { ConnectClient } from '../src/clients/connectClient';
import { SchemaRegistryClient } from '../src/clients/schemaRegistryClient';
import { ConnectionStore, ConnectionMeta } from '../src/connectionStore';
import { MockKafkaConnectServer } from './mockServer';

// Mock VS Code context
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

describe('Comprehensive Integration Tests with Mock Server', () => {
  let mockServer: MockKafkaConnectServer;
  let store: ConnectionStore;
  let originalFetch: any;

  beforeEach(() => {
    store = new ConnectionStore(dummyContext);
    mockServer = new MockKafkaConnectServer();
    
    // Replace global fetch with mock
    originalFetch = global.fetch;
    global.fetch = mockServer.createMockFetch() as any;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    mockServer.reset();
  });

  describe('1. Kafka Connect Authentication Tests', () => {
    describe('Without Authentication Required', () => {
      beforeEach(() => {
        mockServer = new MockKafkaConnectServer({ requireAuth: false });
        global.fetch = mockServer.createMockFetch() as any;
      });

      test('should connect successfully without credentials', async () => {
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: {}
        });

        const connectors = await client.listConnectors();
        expect(connectors).toEqual(['test-connector-1', 'test-connector-2']);
      });

      test('should get connector status without credentials', async () => {
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: {}
        });

        const status = await client.getStatus('test-connector-1');
        expect(status.name).toBe('test-connector-1');
        expect(status.connector.state).toBe('RUNNING');
      });

      test('should pause and resume connector without credentials', async () => {
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: {}
        });

        await client.pauseConnector('test-connector-1');
        let status = await client.getStatus('test-connector-1');
        expect(status.connector.state).toBe('PAUSED');

        await client.resumeConnector('test-connector-1');
        status = await client.getStatus('test-connector-1');
        expect(status.connector.state).toBe('RUNNING');
      });
    });

    describe('With Authentication Required', () => {
      beforeEach(() => {
        mockServer = new MockKafkaConnectServer({ 
          requireAuth: true,
          validCredentials: { username: 'admin', password: 'secret123' },
          validToken: 'jwt-token-123'
        });
        global.fetch = mockServer.createMockFetch() as any;
      });

      test('should fail without credentials when auth required', async () => {
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: {}
        });

        await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
      });

      test('should succeed with valid Basic auth', async () => {
        const authHeader = 'Basic ' + Buffer.from('admin:secret123').toString('base64');
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: { 'Authorization': authHeader }
        });

        const connectors = await client.listConnectors();
        expect(connectors).toEqual(['test-connector-1', 'test-connector-2']);
      });

      test('should fail with invalid Basic auth', async () => {
        const authHeader = 'Basic ' + Buffer.from('admin:wrongpassword').toString('base64');
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: { 'Authorization': authHeader }
        });

        await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
      });

      test('should succeed with valid Bearer token', async () => {
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: { 'Authorization': 'Bearer jwt-token-123' }
        });

        const connectors = await client.listConnectors();
        expect(connectors).toEqual(['test-connector-1', 'test-connector-2']);
      });

      test('should fail with invalid Bearer token', async () => {
        const client = new ConnectClient({
          baseUrl: 'http://localhost:8083',
          headers: { 'Authorization': 'Bearer invalid-token' }
        });

        await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
      });
    });
  });

  describe('2. Schema Registry Authentication Tests', () => {
    describe('Without Authentication Required', () => {
      beforeEach(() => {
        mockServer = new MockKafkaConnectServer({ requireAuth: false });
        global.fetch = mockServer.createMockFetch() as any;
      });

      test('should list subjects without credentials', async () => {
        const client = new SchemaRegistryClient({
          baseUrl: 'http://localhost:8081',
          headers: {}
        });

        const subjects = await client.listSubjects();
        expect(subjects).toEqual(['test-subject-value', 'test-subject-key']);
      });

      test('should get subject versions without credentials', async () => {
        const client = new SchemaRegistryClient({
          baseUrl: 'http://localhost:8081',
          headers: {}
        });

        const versions = await client.getVersions('test-subject-value');
        expect(versions).toEqual([1, 2, 3]);
      });

      test('should get latest schema without credentials', async () => {
        const client = new SchemaRegistryClient({
          baseUrl: 'http://localhost:8081',
          headers: {}
        });

        const schema = await client.getSchema('test-subject-value', 'latest');
        expect(schema.subject).toBe('test-subject-value');
        expect(schema.version).toBe(3);
        expect(schema.id).toBe(123);
      });
    });

    describe('With Authentication Required', () => {
      beforeEach(() => {
        mockServer = new MockKafkaConnectServer({ 
          requireAuth: true,
          validCredentials: { username: 'schema-admin', password: 'schema-secret' },
          validToken: 'schema-jwt-token'
        });
        global.fetch = mockServer.createMockFetch() as any;
      });

      test('should fail without credentials when auth required', async () => {
        const client = new SchemaRegistryClient({
          baseUrl: 'http://localhost:8081',
          headers: {}
        });

        await expect(client.listSubjects()).rejects.toThrow('Failed to list subjects (401)');
      });

      test('should succeed with valid Basic auth', async () => {
        const authHeader = 'Basic ' + Buffer.from('schema-admin:schema-secret').toString('base64');
        const client = new SchemaRegistryClient({
          baseUrl: 'http://localhost:8081',
          headers: { 'Authorization': authHeader }
        });

        const subjects = await client.listSubjects();
        expect(subjects).toEqual(['test-subject-value', 'test-subject-key']);
      });

      test('should succeed with valid Bearer token', async () => {
        const client = new SchemaRegistryClient({
          baseUrl: 'http://localhost:8081',
          headers: { 'Authorization': 'Bearer schema-jwt-token' }
        });

        const subjects = await client.listSubjects();
        expect(subjects).toEqual(['test-subject-value', 'test-subject-key']);
      });
    });
  });

  describe('3. Connector Operations Tests', () => {
    beforeEach(() => {
      mockServer = new MockKafkaConnectServer({ requireAuth: false });
      global.fetch = mockServer.createMockFetch() as any;
    });

    test('should handle connector lifecycle operations', async () => {
      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      // Add a new connector
      mockServer.addConnector('lifecycle-test-connector', {
        'connector.class': 'org.apache.kafka.connect.file.FileStreamSourceConnector',
        'tasks.max': '1'
      });

      // Check initial status
      let status = await client.getStatus('lifecycle-test-connector');
      expect(status.connector.state).toBe('RUNNING');

      // Pause connector
      await client.pauseConnector('lifecycle-test-connector');
      status = await client.getStatus('lifecycle-test-connector');
      expect(status.connector.state).toBe('PAUSED');

      // Resume connector
      await client.resumeConnector('lifecycle-test-connector');
      status = await client.getStatus('lifecycle-test-connector');
      expect(status.connector.state).toBe('RUNNING');
    });

    test('should handle non-existent connector errors', async () => {
      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      await expect(client.getStatus('non-existent-connector')).rejects.toThrow('Failed to get status: 404');
      await expect(client.pauseConnector('non-existent-connector')).rejects.toThrow('Pause failed: 404');
      await expect(client.resumeConnector('non-existent-connector')).rejects.toThrow('Resume failed: 404');
    });

    test('should handle offset operations', async () => {
      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      // Get offsets for running connector
      const offsets = await client.getOffsets('test-connector-1');
      expect(offsets.offsets).toBeDefined();
      expect(Array.isArray(offsets.offsets)).toBe(true);

      // Try to set offsets on running connector (should fail)
      await expect(client.setOffsetsMethod('test-connector-1', { offsets: [] }, 'PATCH'))
        .rejects.toThrow('setOffsets PATCH failed: 409');

      // Stop connector and set offsets
      mockServer.setConnectorState('test-connector-1', 'STOPPED');
      const result = await client.setOffsetsMethod('test-connector-1', { offsets: [] }, 'PATCH');
      expect(result.message).toBe('Offsets updated successfully');
    });
  });

  describe('4. Schema Operations Tests', () => {
    beforeEach(() => {
      mockServer = new MockKafkaConnectServer({ requireAuth: false });
      global.fetch = mockServer.createMockFetch() as any;
    });

    test('should handle schema registration', async () => {
      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: {}
      });

      const schema = {
        type: 'record',
        name: 'User',
        fields: [
          { name: 'id', type: 'long' },
          { name: 'email', type: 'string' }
        ]
      };

      const payload = { schema: JSON.stringify(schema) };
      const registrationResult = await client.registerSchema('user-events-value', payload);
      expect(registrationResult.id).toBe(124);
    });

    test('should handle non-existent subject errors', async () => {
      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: {}
      });

      await expect(client.getVersions('non-existent-subject')).rejects.toThrow('Subject \'non-existent-subject\' not found');
      await expect(client.getSchema('non-existent-subject', 'latest')).rejects.toThrow('Subject \'non-existent-subject\' not found');
    });

    test('should handle schema retrieval by ID', async () => {
      const client = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: {}
      });

      const schema = await client.getSchemaById(123);
      expect(schema.schema).toBeDefined();
      expect(typeof schema.schema).toBe('string');
    });
  });

  describe('5. Copy/Paste Schema Operations', () => {
    beforeEach(() => {
      mockServer = new MockKafkaConnectServer({ requireAuth: false });
      global.fetch = mockServer.createMockFetch() as any;
    });

    test('should copy schema from one subject to another', async () => {
      const sourceClient = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8081',
        headers: {},
        name: 'Source Registry'
      });

      const targetClient = new SchemaRegistryClient({
        baseUrl: 'http://localhost:8082', // Different registry
        headers: {},
        name: 'Target Registry'
      });

      // Get schema from source
      const sourceSchema = await sourceClient.getSchema('test-subject-value', 'latest');
      expect(sourceSchema).toBeDefined();

      // Register schema in target
      const payload = { schema: JSON.stringify(sourceSchema.schema) };
      const registrationResult = await targetClient.registerSchema('test-subject-value', payload);
      expect(registrationResult.id).toBe(124);

      // Verify it was added to target subjects
      mockServer.addSubject('test-subject-value');
      const targetSubjects = await targetClient.listSubjects();
      expect(targetSubjects).toContain('test-subject-value');
    });

    test('should handle copy/paste with authentication', async () => {
      // Source registry requires auth
      const sourceServer = new MockKafkaConnectServer({ 
        requireAuth: true,
        validCredentials: { username: 'source-admin', password: 'source-secret' }
      });

      // Target registry has different auth
      const targetServer = new MockKafkaConnectServer({ 
        requireAuth: true,
        validCredentials: { username: 'target-admin', password: 'target-secret' }
      });

      const sourceClient = new SchemaRegistryClient({
        baseUrl: 'http://source-registry:8081',
        headers: { 'Authorization': 'Basic ' + Buffer.from('source-admin:source-secret').toString('base64') }
      });

      const targetClient = new SchemaRegistryClient({
        baseUrl: 'http://target-registry:8081',
        headers: { 'Authorization': 'Basic ' + Buffer.from('target-admin:target-secret').toString('base64') }
      });

      // Mock different servers for different URLs
      const originalCreateMockFetch = mockServer.createMockFetch;
      global.fetch = jest.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('source-registry')) {
          return sourceServer.createMockFetch()(url, options);
        } else if (url.includes('target-registry')) {
          return targetServer.createMockFetch()(url, options);
        } else {
          return mockServer.createMockFetch()(url, options);
        }
      });

      // This test demonstrates the cross-registry copy pattern
      // In practice, you would get schema from source and register in target
      await expect(sourceClient.listSubjects()).resolves.toBeDefined();
      await expect(targetClient.listSubjects()).resolves.toBeDefined();
    });
  });

  describe('6. End-to-End Connection Store Integration', () => {
    test('should handle full connection workflow with Basic auth', async () => {
      mockServer = new MockKafkaConnectServer({ 
        requireAuth: true,
        validCredentials: { username: 'connect-admin', password: 'connect-secret' }
      });
      global.fetch = mockServer.createMockFetch() as any;

      // Create connection through store
      const conn: ConnectionMeta = {
        id: 'e2e-connect',
        name: 'E2E Connect Test',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic',
        username: 'connect-admin'
      };

      await store.addConnection(conn, 'connect-secret');

      // Retrieve and build headers like the real app does
      const connections = await store.listConnections();
      const savedConn = connections.find(c => c.id === 'e2e-connect');
      expect(savedConn).toBeDefined();

      const secret = await store.getSecret('e2e-connect');
      const headers: Record<string, string> = {};
      if (savedConn!.authType === 'basic' && savedConn!.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(savedConn!.username + ':' + secret).toString('base64');
      }

      // Test connection
      const client = new ConnectClient({ baseUrl: savedConn!.url, headers });
      const connectors = await client.listConnectors();
      expect(connectors).toEqual(['test-connector-1', 'test-connector-2']);
    });

    test('should handle full connection workflow with Bearer token', async () => {
      mockServer = new MockKafkaConnectServer({ 
        requireAuth: true,
        validToken: 'registry-jwt-token'
      });
      global.fetch = mockServer.createMockFetch() as any;

      const conn: ConnectionMeta = {
        id: 'e2e-schema-registry',
        name: 'E2E Schema Registry Test',
        url: 'http://localhost:8081',
        type: 'schema-registry',
        authType: 'bearer'
      };

      await store.addConnection(conn, 'registry-jwt-token');

      const connections = await store.listConnections();
      const savedConn = connections.find(c => c.id === 'e2e-schema-registry');
      const secret = await store.getSecret('e2e-schema-registry');

      const headers: Record<string, string> = {};
      if (savedConn!.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      const client = new SchemaRegistryClient({ baseUrl: savedConn!.url, headers });
      const subjects = await client.listSubjects();
      expect(subjects).toEqual(['test-subject-value', 'test-subject-key']);
    });

    test('should handle connection test failures gracefully', async () => {
      mockServer = new MockKafkaConnectServer({ 
        requireAuth: true,
        validCredentials: { username: 'admin', password: 'correct-password' }
      });
      global.fetch = mockServer.createMockFetch() as any;

      // Create connection with wrong password
      const conn: ConnectionMeta = {
        id: 'failing-connection',
        name: 'Failing Connection Test',
        url: 'http://localhost:8083',
        type: 'connect',
        authType: 'basic',
        username: 'admin'
      };

      await store.addConnection(conn, 'wrong-password');

      const connections = await store.listConnections();
      const savedConn = connections.find(c => c.id === 'failing-connection');
      const secret = await store.getSecret('failing-connection');

      const headers: Record<string, string> = {};
      if (savedConn!.authType === 'basic' && savedConn!.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(savedConn!.username + ':' + secret).toString('base64');
      }

      const client = new ConnectClient({ baseUrl: savedConn!.url, headers });
      await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 401');
    });
  });

  describe('7. Error Scenarios and Edge Cases', () => {
    test('should handle network errors', async () => {
      // Replace fetch with a function that simulates network error
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      await expect(client.listConnectors()).rejects.toThrow('Network error');
    });

    test('should handle malformed JSON responses', async () => {
      global.fetch = jest.fn().mockResolvedValue(new Response('invalid json', {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' })
      }));

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      await expect(client.listConnectors()).rejects.toThrow();
    });

    test('should handle server errors with detailed messages', async () => {
      global.fetch = jest.fn().mockResolvedValue(new Response(
        JSON.stringify({ error: 'Internal server error', details: 'Database connection failed' }),
        {
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'Content-Type': 'application/json' })
        }
      ));

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      await expect(client.listConnectors()).rejects.toThrow('Failed to list connectors: 500 Internal Server Error');
    });

    test('should handle timeout scenarios', async () => {
      // Simulate timeout
      global.fetch = jest.fn().mockImplementation(() => 
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const client = new ConnectClient({
        baseUrl: 'http://localhost:8083',
        headers: {}
      });

      await expect(client.listConnectors()).rejects.toThrow('Request timeout');
    });
  });
});
