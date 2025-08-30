export interface ConnectClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export class ConnectClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(opts: ConnectClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.headers = opts.headers || {};
  }

  async listConnectors(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/connectors`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to list connectors: ${res.status}`);
    return res.json();
  }

  async getStatus(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/status`, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to get status: ${res.status}`);
    return res.json();
  }

  async pauseConnector(name: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/pause`, { method: 'PUT', headers: this.headers });
    if (!res.ok) throw new Error(`Pause failed: ${res.status}`);
  }

  async resumeConnector(name: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/resume`, { method: 'PUT', headers: this.headers });
    if (!res.ok) throw new Error(`Resume failed: ${res.status}`);
  }

  // offsets endpoints can vary; implement a basic fetch/set
  async getOffsets(name: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/offsets`, { headers: this.headers });
    if (!res.ok) throw new Error(`Get offsets failed: ${res.status}`);
    return res.json();
  }

  async setOffsets(name: string, body: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}/connectors/${encodeURIComponent(name)}/offsets`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...this.headers }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Set offsets failed: ${res.status}`);
    return res.json();
  }
}
