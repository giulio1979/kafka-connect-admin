/**
 * Integration Tests for Real Kafka Connect Authentication
 * 
 * This test file is designed to test against actual Kafka Connect clusters
 * to diagnose authentication issues in real environments.
 * 
 * To run these tests:
 * 1. Set environment variables for your test cluster
 * 2. Run: INTEGRATION=1 npm test -- realConnectAuth.test.ts
 */

import { ConnectClient } from '../src/clients/connectClient';
import { SchemaRegistryClient } from '../src/clients/schemaRegistryClient';
import { ConnectionStore, ConnectionMeta } from '../src/connectionStore';

// Mock VS Code context for connection store
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

// Test configuration from environment variables
const TEST_CONFIG = {
  CONNECT_URL: process.env.TEST_CONNECT_URL || 'http://localhost:8083',
  CONNECT_USERNAME: process.env.TEST_CONNECT_USERNAME || '',
  CONNECT_PASSWORD: process.env.TEST_CONNECT_PASSWORD || '',
  CONNECT_TOKEN: process.env.TEST_CONNECT_TOKEN || '',
  SCHEMA_REGISTRY_URL: process.env.TEST_SCHEMA_REGISTRY_URL || 'http://localhost:8081',
  SCHEMA_REGISTRY_USERNAME: process.env.TEST_SCHEMA_REGISTRY_USERNAME || '',
  SCHEMA_REGISTRY_PASSWORD: process.env.TEST_SCHEMA_REGISTRY_PASSWORD || '',
  SCHEMA_REGISTRY_TOKEN: process.env.TEST_SCHEMA_REGISTRY_TOKEN || '',
  SKIP_INTEGRATION: !process.env.INTEGRATION
};

describe('Real Kafka Connect Authentication Integration Tests', () => {
  let store: ConnectionStore;

  beforeEach(() => {
    store = new ConnectionStore(dummyContext);
  });

  beforeAll(() => {
    if (TEST_CONFIG.SKIP_INTEGRATION) {
      console.log('⏭️  Skipping integration tests (set INTEGRATION=1 to run)');
      console.log('📋 Environment variables for testing:');
      console.log('   TEST_CONNECT_URL=http://your-connect:8083');
      console.log('   TEST_CONNECT_USERNAME=admin');
      console.log('   TEST_CONNECT_PASSWORD=admin-secret');
      console.log('   TEST_SCHEMA_REGISTRY_URL=http://your-registry:8081');
      console.log('   TEST_SCHEMA_REGISTRY_USERNAME=admin');
      console.log('   TEST_SCHEMA_REGISTRY_PASSWORD=admin-secret');
      console.log('   INTEGRATION=1');
    }
  });

  describe('Kafka Connect Authentication', () => {
    test('Connect without authentication', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION) return;

      const client = new ConnectClient({
        baseUrl: TEST_CONFIG.CONNECT_URL,
        headers: {}
      });

      try {
        const connectors = await client.listConnectors();
        console.log('✅ No authentication required');
        console.log(`📋 Found ${connectors.length} connectors:`, connectors);
        expect(Array.isArray(connectors)).toBe(true);
      } catch (error: any) {
        console.log('❌ No auth failed:', error.message);
        
        if (error.message.includes('401')) {
          console.log('🔒 Authentication is required (expected)');
          expect(error.message).toContain('401');
        } else {
          console.log('⚠️  Unexpected error:', error.message);
          throw error;
        }
      }
    }, 10000);

    test('Connect with Basic Authentication', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION || !TEST_CONFIG.CONNECT_USERNAME || !TEST_CONFIG.CONNECT_PASSWORD) {
        console.log('⏭️  Skipping Basic auth test (no credentials provided)');
        return;
      }

      // Test the exact header building logic from your code
      const headers: Record<string, string> = {};
      const authHeader = 'Basic ' + Buffer.from(TEST_CONFIG.CONNECT_USERNAME + ':' + TEST_CONFIG.CONNECT_PASSWORD).toString('base64');
      headers['Authorization'] = authHeader;

      console.log('🔑 Testing Basic auth with header:', authHeader);
      console.log('👤 Username:', TEST_CONFIG.CONNECT_USERNAME);
      console.log('🔗 URL:', TEST_CONFIG.CONNECT_URL);

      const client = new ConnectClient({
        baseUrl: TEST_CONFIG.CONNECT_URL,
        headers
      });

      try {
        const connectors = await client.listConnectors();
        console.log('✅ Basic authentication successful');
        console.log(`📋 Found ${connectors.length} connectors:`, connectors);
        expect(Array.isArray(connectors)).toBe(true);
      } catch (error: any) {
        console.log('❌ Basic auth failed:', error.message);
        console.log('🔍 Debug info:');
        console.log('   - Check username/password combination');
        console.log('   - Verify server accepts Basic auth');
        console.log('   - Check if user has required permissions');
        console.log('   - Test with curl: curl -u ' + TEST_CONFIG.CONNECT_USERNAME + ':' + TEST_CONFIG.CONNECT_PASSWORD + ' ' + TEST_CONFIG.CONNECT_URL + '/connectors');
        
        if (error.message.includes('401')) {
          console.log('🚫 401 Unauthorized - credentials are rejected');
        } else if (error.message.includes('403')) {
          console.log('🚫 403 Forbidden - user authenticated but lacks permissions');
        }
        
        throw error;
      }
    }, 10000);

    test('Connect with Bearer Token', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION || !TEST_CONFIG.CONNECT_TOKEN) {
        console.log('⏭️  Skipping Bearer token test (no token provided)');
        return;
      }

      const headers: Record<string, string> = {};
      headers['Authorization'] = `Bearer ${TEST_CONFIG.CONNECT_TOKEN}`;

      console.log('🎫 Testing Bearer token');
      console.log('🔗 URL:', TEST_CONFIG.CONNECT_URL);

      const client = new ConnectClient({
        baseUrl: TEST_CONFIG.CONNECT_URL,
        headers
      });

      try {
        const connectors = await client.listConnectors();
        console.log('✅ Bearer token authentication successful');
        console.log(`📋 Found ${connectors.length} connectors:`, connectors);
        expect(Array.isArray(connectors)).toBe(true);
      } catch (error: any) {
        console.log('❌ Bearer token failed:', error.message);
        console.log('🔍 Debug info:');
        console.log('   - Check token validity and expiration');
        console.log('   - Verify server accepts Bearer tokens');
        console.log('   - Check if token has required scopes/permissions');
        
        throw error;
      }
    }, 10000);

    test('Connect with enhanced headers (Content-Type/Accept)', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION) return;

      // Test if adding Content-Type and Accept headers helps
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      };

      // Add auth if available
      if (TEST_CONFIG.CONNECT_USERNAME && TEST_CONFIG.CONNECT_PASSWORD) {
        headers['Authorization'] = 'Basic ' + Buffer.from(TEST_CONFIG.CONNECT_USERNAME + ':' + TEST_CONFIG.CONNECT_PASSWORD).toString('base64');
        console.log('🔑 Using Basic auth with enhanced headers');
      } else if (TEST_CONFIG.CONNECT_TOKEN) {
        headers['Authorization'] = `Bearer ${TEST_CONFIG.CONNECT_TOKEN}`;
        console.log('🎫 Using Bearer token with enhanced headers');
      } else {
        console.log('📋 Testing enhanced headers without auth');
      }

      const client = new ConnectClient({
        baseUrl: TEST_CONFIG.CONNECT_URL,
        headers
      });

      try {
        const connectors = await client.listConnectors();
        console.log('✅ Enhanced headers successful');
        console.log(`📋 Found ${connectors.length} connectors:`, connectors);
        expect(Array.isArray(connectors)).toBe(true);
      } catch (error: any) {
        console.log('❌ Enhanced headers failed:', error.message);
        throw error;
      }
    }, 10000);
  });

  describe('Schema Registry Authentication', () => {
    test('Schema Registry with Basic Authentication', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION || !TEST_CONFIG.SCHEMA_REGISTRY_USERNAME || !TEST_CONFIG.SCHEMA_REGISTRY_PASSWORD) {
        console.log('⏭️  Skipping Schema Registry Basic auth test (no credentials provided)');
        return;
      }

      const headers: Record<string, string> = {};
      headers['Authorization'] = 'Basic ' + Buffer.from(TEST_CONFIG.SCHEMA_REGISTRY_USERNAME + ':' + TEST_CONFIG.SCHEMA_REGISTRY_PASSWORD).toString('base64');

      console.log('🔑 Testing Schema Registry Basic auth');
      console.log('👤 Username:', TEST_CONFIG.SCHEMA_REGISTRY_USERNAME);
      console.log('🔗 URL:', TEST_CONFIG.SCHEMA_REGISTRY_URL);

      const client = new SchemaRegistryClient({
        baseUrl: TEST_CONFIG.SCHEMA_REGISTRY_URL,
        headers
      });

      try {
        const subjects = await client.listSubjects();
        console.log('✅ Schema Registry Basic authentication successful');
        console.log(`📋 Found ${subjects.length} subjects:`, subjects);
        expect(Array.isArray(subjects)).toBe(true);
      } catch (error: any) {
        console.log('❌ Schema Registry Basic auth failed:', error.message);
        console.log('🔍 Debug info:');
        console.log('   - Check Schema Registry username/password');
        console.log('   - Verify Schema Registry accepts Basic auth');
        console.log('   - Test with curl: curl -u ' + TEST_CONFIG.SCHEMA_REGISTRY_USERNAME + ':' + TEST_CONFIG.SCHEMA_REGISTRY_PASSWORD + ' ' + TEST_CONFIG.SCHEMA_REGISTRY_URL + '/subjects');
        
        throw error;
      }
    }, 10000);
  });

  describe('End-to-End Connection Store Integration', () => {
    test('Full connection flow with ConnectionStore', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION || !TEST_CONFIG.CONNECT_USERNAME || !TEST_CONFIG.CONNECT_PASSWORD) {
        console.log('⏭️  Skipping full connection flow test (no credentials provided)');
        return;
      }

      // Create connection exactly as the UI would
      const conn: ConnectionMeta = {
        id: 'integration-test-connect',
        name: 'Integration Test Connect',
        url: TEST_CONFIG.CONNECT_URL,
        type: 'connect',
        authType: 'basic',
        username: TEST_CONFIG.CONNECT_USERNAME
      };

      // Store connection with password
      await store.addConnection(conn, TEST_CONFIG.CONNECT_PASSWORD);

      // Retrieve connection and build headers exactly like connectionManager.ts does
      const conns = await store.listConnections();
      const c = conns.find(x => x.id === conn.id);
      expect(c).toBeDefined();

      const secret = await store.getSecret(conn.id);
      expect(secret).toBe(TEST_CONFIG.CONNECT_PASSWORD);

      // Build headers exactly like the real code
      const headers: Record<string, string> = {};
      if (c!.authType === 'basic' && c!.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(c!.username + ':' + secret).toString('base64');
      } else if (c!.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      console.log('🔄 Testing full connection flow');
      console.log('💾 Connection stored and retrieved successfully');
      console.log('🔑 Headers built:', Object.keys(headers));

      // Test the connection like connectionManager.ts does
      const { ConnectClient } = await import('../src/clients/connectClient');
      const client = new ConnectClient({ baseUrl: c!.url, headers });

      try {
        const connectors = await client.listConnectors();
        console.log('✅ Full connection flow successful');
        console.log(`📋 Found ${connectors.length} connectors through full flow`);
        expect(Array.isArray(connectors)).toBe(true);
      } catch (error: any) {
        console.log('❌ Full connection flow failed:', error.message);
        console.log('🔍 This indicates an issue in the actual connection flow used by your extension');
        throw error;
      }
    }, 10000);
  });

  describe('Debugging Utilities', () => {
    test('Network connectivity test', async () => {
      if (TEST_CONFIG.SKIP_INTEGRATION) return;

      console.log('🌐 Testing network connectivity...');
      
      try {
        // Test basic HTTP connectivity without auth
        const response = await fetch(TEST_CONFIG.CONNECT_URL);
        console.log(`📡 HTTP response status: ${response.status}`);
        console.log(`📡 HTTP response headers:`, Object.fromEntries(response.headers.entries()));
        
        if (response.status === 401) {
          console.log('✅ Server is reachable and requires authentication (expected)');
        } else if (response.status === 200) {
          console.log('✅ Server is reachable and allows unauthenticated access');
        } else {
          console.log(`⚠️  Unexpected status: ${response.status}`);
        }
      } catch (error: any) {
        console.log('❌ Network connectivity failed:', error.message);
        console.log('🔍 Check:');
        console.log('   - Server is running and accessible');
        console.log('   - Network/firewall settings');
        console.log('   - URL is correct');
        throw error;
      }
    }, 10000);

    test('Authorization header validation', () => {
      if (!TEST_CONFIG.CONNECT_USERNAME || !TEST_CONFIG.CONNECT_PASSWORD) return;

      const username = TEST_CONFIG.CONNECT_USERNAME;
      const password = TEST_CONFIG.CONNECT_PASSWORD;
      
      const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
      console.log(`🔍 Authorization header: ${authHeader}`);
      
      // Decode and verify
      const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
      console.log(`🔍 Decoded credentials: ${decoded}`);
      expect(decoded).toBe(`${username}:${password}`);
      
      // Test with curl command
      const curlCommand = `curl -u "${username}:${password}" ${TEST_CONFIG.CONNECT_URL}/connectors`;
      console.log(`🔍 Test with curl: ${curlCommand}`);
    });
  });
});

// Helper function to run a quick diagnostic
export function runQuickDiagnostic() {
  console.log('🔧 Quick Diagnostic for 401 Errors:');
  console.log('1. Set environment variables:');
  console.log('   export TEST_CONNECT_URL=http://your-server:8083');
  console.log('   export TEST_CONNECT_USERNAME=your-username');
  console.log('   export TEST_CONNECT_PASSWORD=your-password');
  console.log('   export INTEGRATION=1');
  console.log('2. Run: npm test -- realConnectAuth.test.ts');
  console.log('3. Check the detailed debug output');
}
