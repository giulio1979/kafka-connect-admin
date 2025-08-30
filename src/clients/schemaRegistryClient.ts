export interface SchemaRegistryOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export class SchemaRegistryClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(opts: SchemaRegistryOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.headers = opts.headers || {};
  }

  async listSubjects(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/subjects`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list subjects: ${res.status}`);
    return res.json();
  }

  async getVersions(subject: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to get versions: ${res.status}`);
    return res.json();
  }

  async getSchema(subject: string, version: string | number): Promise<any> {
    const res = await fetch(`${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions/${version}`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to get schema: ${res.status}`);
    return res.json();
  }

  async registerSchema(subject: string, schemaPayload: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/subjects/${encodeURIComponent(subject)}/versions`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...this.headers }, body: JSON.stringify(schemaPayload) });
    if (!res.ok) throw new Error(`Failed to register schema: ${res.status}`);
    return res.json();
  }
}
