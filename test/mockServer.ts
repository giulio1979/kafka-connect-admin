/**
 * Mock Server for Kafka Connect and Schema Registry Testing
 * 
 * Provides realistic mock responses for testing authentication,
 * connector operations, schema operations, and error scenarios.
 */

export interface MockServerOptions {
  requireAuth?: boolean;
  validCredentials?: { username: string; password: string };
  validToken?: string;
  connectors?: string[];
  subjects?: string[];
  schemas?: Record<string, any>;
  simulateErrors?: boolean;
}

export class MockKafkaConnectServer {
  private options: MockServerOptions;
  private connectorConfigs: Record<string, any> = {};
  private connectorStatuses: Record<string, any> = {};

  constructor(options: MockServerOptions = {}) {
    this.options = {
      requireAuth: false,
      validCredentials: { username: 'admin', password: 'admin-secret' },
      validToken: 'valid-jwt-token',
      connectors: ['test-connector-1', 'test-connector-2'],
      subjects: ['test-subject-value', 'test-subject-key'],
      schemas: {},
      simulateErrors: false,
      ...options
    };

    // Initialize default connector statuses
    this.options.connectors?.forEach(name => {
      this.connectorStatuses[name] = {
        name,
        connector: { state: 'RUNNING', worker_id: 'worker-1:8083' },
        tasks: [{ id: 0, state: 'RUNNING', worker_id: 'worker-1:8083' }],
        type: 'source'
      };
    });
  }

  /**
   * Mock fetch function that simulates Kafka Connect and Schema Registry responses
   */
  createMockFetch() {
    return async (url: string, options: any = {}): Promise<Response> => {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      
      // Check authentication if required
      if (this.options.requireAuth && !this.isAuthenticated(headers)) {
        return this.createErrorResponse(401, { 
          error_code: 401, 
          message: 'Unauthorized' 
        });
      }

      // Route requests based on URL patterns
      if (url.includes('/connectors')) {
        return this.handleConnectRequest(url, method, options);
      } else if (url.includes('/subjects') || url.includes('/schemas')) {
        return this.handleSchemaRegistryRequest(url, method, options);
      } else {
        return this.createErrorResponse(404, { message: 'Not found' });
      }
    };
  }

  private isAuthenticated(headers: Record<string, string>): boolean {
    const authHeader = headers['Authorization'] || headers['authorization'];
    if (!authHeader) return false;

    if (authHeader.startsWith('Basic ')) {
      const credentials = Buffer.from(authHeader.substring(6), 'base64').toString();
      const [username, password] = credentials.split(':');
      return username === this.options.validCredentials?.username && 
             password === this.options.validCredentials?.password;
    }

    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return token === this.options.validToken;
    }

    return false;
  }

  private async handleConnectRequest(url: string, method: string, options: any): Promise<Response> {
    // GET /connectors - List connectors
    if (method === 'GET' && url.endsWith('/connectors')) {
      return this.createSuccessResponse(this.options.connectors || []);
    }

    // GET /connectors/{name}/status - Get connector status
    const statusMatch = url.match(/\/connectors\/([^\/]+)\/status$/);
    if (method === 'GET' && statusMatch) {
      const connectorName = decodeURIComponent(statusMatch[1]);
      const status = this.connectorStatuses[connectorName];
      if (status) {
        return this.createSuccessResponse(status);
      } else {
        return this.createErrorResponse(404, { 
          error_code: 404, 
          message: `Connector ${connectorName} not found` 
        });
      }
    }

    // GET /connectors/{name}/config - Get connector config
    const configMatch = url.match(/\/connectors\/([^\/]+)\/config$/);
    if (method === 'GET' && configMatch) {
      const connectorName = decodeURIComponent(configMatch[1]);
      const config = this.connectorConfigs[connectorName] || {
        'connector.class': 'org.apache.kafka.connect.file.FileStreamSourceConnector',
        'tasks.max': '1',
        'file': '/tmp/test.txt',
        'topic': 'test-topic'
      };
      return this.createSuccessResponse(config);
    }

    // PUT /connectors/{name}/pause - Pause connector
    const pauseMatch = url.match(/\/connectors\/([^\/]+)\/pause$/);
    if (method === 'PUT' && pauseMatch) {
      const connectorName = decodeURIComponent(pauseMatch[1]);
      if (this.connectorStatuses[connectorName]) {
        this.connectorStatuses[connectorName].connector.state = 'PAUSED';
        return this.createSuccessResponse({});
      } else {
        return this.createErrorResponse(404, { message: `Connector ${connectorName} not found` });
      }
    }

    // PUT /connectors/{name}/resume - Resume connector
    const resumeMatch = url.match(/\/connectors\/([^\/]+)\/resume$/);
    if (method === 'PUT' && resumeMatch) {
      const connectorName = decodeURIComponent(resumeMatch[1]);
      if (this.connectorStatuses[connectorName]) {
        this.connectorStatuses[connectorName].connector.state = 'RUNNING';
        return this.createSuccessResponse({});
      } else {
        return this.createErrorResponse(404, { message: `Connector ${connectorName} not found` });
      }
    }

    // GET /connectors/{name}/offsets - Get connector offsets
    const offsetsMatch = url.match(/\/connectors\/([^\/]+)\/offsets$/);
    if (method === 'GET' && offsetsMatch) {
      const connectorName = decodeURIComponent(offsetsMatch[1]);
      if (this.connectorStatuses[connectorName]) {
        return this.createSuccessResponse({
          offsets: [
            {
              partition: { file: '/tmp/test.txt' },
              offset: { position: 1024 }
            }
          ]
        });
      } else {
        return this.createErrorResponse(404, { message: `Connector ${connectorName} not found` });
      }
    }

    // PATCH /connectors/{name}/offsets - Set connector offsets
    if (method === 'PATCH' && offsetsMatch) {
      const connectorName = decodeURIComponent(offsetsMatch[1]);
      if (this.connectorStatuses[connectorName]) {
        const connectorState = this.connectorStatuses[connectorName].connector.state;
        if (connectorState !== 'STOPPED') {
          return this.createErrorResponse(409, { 
            error_code: 409,
            message: 'Connector must be stopped to modify offsets' 
          });
        }
        return this.createSuccessResponse({ message: 'Offsets updated successfully' });
      } else {
        return this.createErrorResponse(404, { message: `Connector ${connectorName} not found` });
      }
    }

    return this.createErrorResponse(404, { message: 'Endpoint not found' });
  }

  private async handleSchemaRegistryRequest(url: string, method: string, options: any): Promise<Response> {
    // GET /subjects - List subjects
    if (method === 'GET' && url.endsWith('/subjects')) {
      return this.createSuccessResponse(this.options.subjects || []);
    }

    // GET /subjects/{subject}/versions - Get subject versions
    const versionsMatch = url.match(/\/subjects\/([^\/]+)\/versions$/);
    if (method === 'GET' && versionsMatch) {
      const subject = decodeURIComponent(versionsMatch[1]);
      if (this.options.subjects?.includes(subject)) {
        return this.createSuccessResponse([1, 2, 3]);
      } else {
        return this.createErrorResponse(404, { 
          error_code: 40401, 
          message: `Subject '${subject}' not found.` 
        });
      }
    }

    // GET /subjects/{subject}/versions/latest - Get latest schema
    const latestMatch = url.match(/\/subjects\/([^\/]+)\/versions\/latest$/);
    if (method === 'GET' && latestMatch) {
      const subject = decodeURIComponent(latestMatch[1]);
      if (this.options.subjects?.includes(subject)) {
        return this.createSuccessResponse({
          subject,
          version: 3,
          id: 123,
          schema: {
            type: 'record',
            name: 'TestRecord',
            fields: [
              { name: 'id', type: 'long' },
              { name: 'name', type: 'string' }
            ]
          }
        });
      } else {
        return this.createErrorResponse(404, { 
          error_code: 40401, 
          message: `Subject '${subject}' not found.` 
        });
      }
    }

    // POST /subjects/{subject}/versions - Register new schema
    const registerMatch = url.match(/\/subjects\/([^\/]+)\/versions$/);
    if (method === 'POST' && registerMatch) {
      const subject = decodeURIComponent(registerMatch[1]);
      const body = JSON.parse(options.body || '{}');
      
      if (!body.schema) {
        return this.createErrorResponse(422, { 
          error_code: 422, 
          message: 'Schema is required' 
        });
      }

      // Add to subjects list if not already present
      if (!this.options.subjects?.includes(subject)) {
        this.options.subjects?.push(subject);
      }

      return this.createSuccessResponse({ id: 124 });
    }

    // GET /schemas/ids/{id} - Get schema by ID
    const schemaByIdMatch = url.match(/\/schemas\/ids\/(\d+)$/);
    if (method === 'GET' && schemaByIdMatch) {
      const schemaId = parseInt(schemaByIdMatch[1]);
      return this.createSuccessResponse({
        schema: JSON.stringify({
          type: 'record',
          name: 'TestRecord',
          fields: [
            { name: 'id', type: 'long' },
            { name: 'name', type: 'string' }
          ]
        })
      });
    }

    return this.createErrorResponse(404, { message: 'Endpoint not found' });
  }

  private createSuccessResponse(data: any): Response {
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  private createErrorResponse(status: number, error: any): Response {
    return new Response(JSON.stringify(error), {
      status: status,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  private getStatusText(status: number): string {
    switch (status) {
      case 401: return 'Unauthorized';
      case 403: return 'Forbidden';
      case 404: return 'Not Found';
      case 409: return 'Conflict';
      case 422: return 'Unprocessable Entity';
      case 500: return 'Internal Server Error';
      default: return 'Unknown';
    }
  }

  // Helper methods for test scenarios
  addConnector(name: string, config: any = {}) {
    if (!this.options.connectors?.includes(name)) {
      this.options.connectors?.push(name);
    }
    this.connectorConfigs[name] = config;
    this.connectorStatuses[name] = {
      name,
      connector: { state: 'RUNNING', worker_id: 'worker-1:8083' },
      tasks: [{ id: 0, state: 'RUNNING', worker_id: 'worker-1:8083' }],
      type: 'source'
    };
  }

  removeConnector(name: string) {
    const index = this.options.connectors?.indexOf(name);
    if (index !== undefined && index > -1) {
      this.options.connectors?.splice(index, 1);
    }
    delete this.connectorConfigs[name];
    delete this.connectorStatuses[name];
  }

  setConnectorState(name: string, state: string) {
    if (this.connectorStatuses[name]) {
      this.connectorStatuses[name].connector.state = state;
    }
  }

  addSubject(subject: string, schema?: any) {
    if (!this.options.subjects?.includes(subject)) {
      this.options.subjects?.push(subject);
    }
    if (schema) {
      this.options.schemas = this.options.schemas || {};
      this.options.schemas[subject] = schema;
    }
  }

  removeSubject(subject: string) {
    const index = this.options.subjects?.indexOf(subject);
    if (index !== undefined && index > -1) {
      this.options.subjects?.splice(index, 1);
    }
    if (this.options.schemas) {
      delete this.options.schemas[subject];
    }
  }

  reset() {
    this.options.connectors = ['test-connector-1', 'test-connector-2'];
    this.options.subjects = ['test-subject-value', 'test-subject-key'];
    this.connectorConfigs = {};
    this.connectorStatuses = {};
    
    this.options.connectors.forEach(name => {
      this.connectorStatuses[name] = {
        name,
        connector: { state: 'RUNNING', worker_id: 'worker-1:8083' },
        tasks: [{ id: 0, state: 'RUNNING', worker_id: 'worker-1:8083' }],
        type: 'source'
      };
    });
  }
}
