/**
 * Real Environment Connection Testing Utility
 * 
 * This file contains utilities to help debug 401 authentication issues 
 * in your actual test environment. Uncomment and modify the tests below
 * to match your actual connection details.
 * 
 * IMPORTANT: Never commit real credentials to version control!
 */

import { ConnectClient } from '../src/clients/connectClient';
import { SchemaRegistryClient } from '../src/clients/schemaRegistryClient';

describe.skip('Real Environment Testing (DISABLED BY DEFAULT)', () => {
  // Uncomment and modify these tests to debug your actual environment
  // Remember to skip or delete these tests before committing!

  /*
  describe('Kafka Connect Authentication Debug', () => {
    test('Test actual Connect cluster connection', async () => {
      // Replace with your actual Connect cluster details
      const client = new ConnectClient({
        baseUrl: 'http://your-connect-cluster:8083',
        headers: {
          // Test with no auth first
        }
      });

      try {
        const connectors = await client.listConnectors();
        console.log('✅ No auth required - connectors found:', connectors);
      } catch (error: any) {
        console.log('❌ Error without auth:', error.message);
        
        if (error.message.includes('401')) {
          console.log('🔒 Authentication required - 401 Unauthorized');
          
          // Now test with Basic auth
          const clientWithAuth = new ConnectClient({
            baseUrl: 'http://your-connect-cluster:8083',
            headers: {
              'Authorization': 'Basic ' + Buffer.from('your-username:your-password').toString('base64')
            }
          });
          
          try {
            const connectorsAuth = await clientWithAuth.listConnectors();
            console.log('✅ Basic auth successful - connectors:', connectorsAuth);
          } catch (authError: any) {
            console.log('❌ Basic auth failed:', authError.message);
            console.log('🔍 Check username/password combination');
          }
        }
      }
    });

    test('Debug authorization header format', () => {
      const username = 'your-username';
      const password = 'your-password';
      
      const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
      console.log('Authorization header:', authHeader);
      
      // Verify it decodes correctly
      const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
      console.log('Decoded credentials:', decoded);
      console.log('Expected format: username:password');
    });
  });

  describe('Schema Registry Authentication Debug', () => {
    test('Test actual Schema Registry connection', async () => {
      // Replace with your actual Schema Registry details
      const client = new SchemaRegistryClient({
        baseUrl: 'http://your-schema-registry:8081',
        headers: {
          // Test with no auth first
        }
      });

      try {
        const subjects = await client.listSubjects();
        console.log('✅ No auth required - subjects found:', subjects);
      } catch (error: any) {
        console.log('❌ Error without auth:', error.message);
        
        if (error.message.includes('401')) {
          console.log('🔒 Authentication required - 401 Unauthorized');
          
          // Test with Bearer token if you have one
          const clientWithBearer = new SchemaRegistryClient({
            baseUrl: 'http://your-schema-registry:8081',
            headers: {
              'Authorization': 'Bearer your-jwt-token-here'
            }
          });
          
          try {
            const subjectsAuth = await clientWithBearer.listSubjects();
            console.log('✅ Bearer auth successful - subjects:', subjectsAuth);
          } catch (authError: any) {
            console.log('❌ Bearer auth failed:', authError.message);
            console.log('🔍 Check token validity and expiration');
          }
        }
      }
    });
  });
  */

  // Helper functions for debugging
  describe('Authentication Debug Helpers', () => {
    test('Generate Basic Auth header', () => {
      // Modify these values to match your credentials
      const username = 'admin';
      const password = 'admin-secret';
      
      const authHeader = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
      console.log(`\n🔑 Basic Auth Header for ${username}:${password}`);
      console.log(`Authorization: ${authHeader}`);
      
      // Verify decoding
      const decoded = Buffer.from(authHeader.split(' ')[1], 'base64').toString();
      console.log(`Decoded: ${decoded}`);
    });

    test('Validate Bearer Token format', () => {
      // Replace with your actual token
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example.token';
      
      const authHeader = `Bearer ${token}`;
      console.log(`\n🎫 Bearer Token Header:`);
      console.log(`Authorization: ${authHeader}`);
      
      // Basic JWT validation (just format check)
      const parts = token.split('.');
      if (parts.length === 3) {
        console.log('✅ Token has correct JWT format (3 parts)');
        try {
          const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          console.log('Header:', header);
          console.log('Payload:', payload);
          
          if (payload.exp) {
            const expDate = new Date(payload.exp * 1000);
            const now = new Date();
            console.log(`Token expires: ${expDate}`);
            console.log(`Current time: ${now}`);
            console.log(`Token expired: ${expDate < now ? '❌ YES' : '✅ NO'}`);
          }
        } catch (e) {
          console.log('❌ Cannot decode JWT - might be encrypted or malformed');
        }
      } else {
        console.log('❌ Token does not have JWT format');
      }
    });

    test('Common 401 error scenarios', () => {
      console.log('\n🔍 Common 401 Error Causes:');
      console.log('1. ❌ Wrong username/password combination');
      console.log('2. ❌ Missing Authorization header when required');
      console.log('3. ❌ Malformed Authorization header (typos, wrong format)');
      console.log('4. ❌ Expired Bearer token (JWT)');
      console.log('5. ❌ Wrong authentication type (Basic vs Bearer)');
      console.log('6. ❌ Special characters in username/password not properly encoded');
      console.log('7. ❌ Network/proxy stripping authentication headers');
      console.log('8. ❌ Server authentication configuration changed');
      console.log('9. ❌ User account disabled or permissions revoked');
      console.log('10. ❌ Authentication method not supported by server');
    });

    test('Debugging checklist', () => {
      console.log('\n✅ Debugging Checklist for 401 Errors:');
      console.log('1. Verify the service requires authentication at all');
      console.log('2. Check if the endpoint URL is correct');
      console.log('3. Validate username/password combination externally (curl, Postman)');
      console.log('4. Test with a simple curl command first:');
      console.log('   curl -u username:password http://your-server:8083/connectors');
      console.log('5. Check if the server logs show authentication attempts');
      console.log('6. Verify no proxy is interfering with auth headers');
      console.log('7. Test with different users if available');
      console.log('8. Check server authentication configuration');
      console.log('9. Verify SSL/TLS certificate issues aren\'t causing problems');
      console.log('10. Look for authentication method mismatches (LDAP, file-based, etc.)');
    });
  });
});

/**
 * Quick Test Commands:
 * 
 * To test specific authentication scenarios:
 * 
 * 1. Enable the tests above by removing .skip from describe.skip
 * 2. Replace placeholder values with your actual connection details
 * 3. Run: npm test -- connectionDebugging.test.ts
 * 4. Review console output for debugging information
 * 
 * Example curl commands to test outside VS Code:
 * 
 * # Test Connect without auth
 * curl http://localhost:8083/connectors
 * 
 * # Test Connect with Basic auth
 * curl -u admin:password http://localhost:8083/connectors
 * 
 * # Test Schema Registry without auth  
 * curl http://localhost:8081/subjects
 * 
 * # Test Schema Registry with Basic auth
 * curl -u admin:password http://localhost:8081/subjects
 * 
 * # Test with Bearer token
 * curl -H "Authorization: Bearer your-token" http://localhost:8081/subjects
 */
