import { SchemaRegistryClient, SchemaInfo, SchemaMetadata } from '@confluentinc/schemaregistry';
import { getOutputChannel } from '../logger';

interface ConnectionSettings {
    url: string;
    username?: string;
    password?: string;
    token?: string;
}

export class OfficialSchemaRegistryClient {
    private client: SchemaRegistryClient;
    private name: string;

    constructor(connection: ConnectionSettings, name?: string) {
        this.name = name || connection.url || 'SchemaRegistry';
        
        const config: any = {
            baseURLs: [connection.url]
        };

        // Add authentication if available
        if (connection.username && connection.password) {
            config.auth = {
                username: connection.username,
                password: connection.password
            };
        } else if (connection.token) {
            config.auth = {
                bearer: connection.token
            };
        }

        this.client = new SchemaRegistryClient(config);
        getOutputChannel().appendLine(`[${this.name}] Official client initialized`);
    }

    async listSubjects(): Promise<string[]> {
        const subjects = await this.client.getAllSubjects();
        getOutputChannel().appendLine(`[${this.name}] Found ${subjects.length} subjects`);
        return subjects;
    }

    async getVersions(subject: string): Promise<number[]> {
        const versions = await this.client.getAllVersions(subject);
        getOutputChannel().appendLine(`[${this.name}] Found ${versions.length} versions for ${subject}`);
        return versions;
    }

    async getSchema(subject: string, version: number | 'latest'): Promise<any> {
        let schemaMetadata: SchemaMetadata;
        if (version === 'latest') {
            schemaMetadata = await this.client.getLatestSchemaMetadata(subject);
        } else {
            schemaMetadata = await this.client.getSchemaMetadata(subject, version);
        }

        return {
            id: schemaMetadata.id,
            version: schemaMetadata.version,
            schema: schemaMetadata.schema,
            schemaType: schemaMetadata.schemaType || 'AVRO',
            subject: schemaMetadata.subject
        };
    }

    async registerSchema(subject: string, payload: any): Promise<{ id: number }> {
        const schemaInfo: SchemaInfo = {
            schema: typeof payload.schema === 'string' ? payload.schema : JSON.stringify(payload.schema),
            schemaType: payload.schemaType || 'AVRO'
        };
        
        const id = await this.client.register(subject, schemaInfo);
        getOutputChannel().appendLine(`[${this.name}] Registered schema with ID: ${id}`);
        
        return { id };
    }

    async verifySubjectRegistered(subject: string, maxAttempts: number = 5): Promise<boolean> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const versions = await this.getVersions(subject);
                if (versions.length > 0) {
                    getOutputChannel().appendLine(`[${this.name}] ✓ Subject ${subject} verified`);
                    return true;
                }
            } catch (error) {
                // Continue retrying
            }
            
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
            }
        }
        
        getOutputChannel().appendLine(`[${this.name}] ✗ Subject ${subject} verification failed`);
        return false;
    }
}
