import * as vscode from 'vscode';

export type ConnectionType = 'connect' | 'schema-registry';

export interface ConnectionMeta {
  id: string;
  name: string;
  url: string;
  type: ConnectionType;
  authType?: 'none' | 'basic' | 'bearer';
  username?: string;
}

const CONNECTIONS_KEY = 'connectAdmin.connections.v1';

export class ConnectionStore implements vscode.Disposable {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async listConnections(): Promise<ConnectionMeta[]> {
    const raw = this.context.globalState.get<string>(CONNECTIONS_KEY, '[]');
    try {
      const connections = JSON.parse(raw) as ConnectionMeta[];
      console.log('listConnections:', connections); // Debug log
      return connections;
    } catch (e) {
      console.error('Error parsing connections:', e); // Debug log
      return [];
    }
  }

  private async saveConnections(conns: ConnectionMeta[]) {
    await this.context.globalState.update(CONNECTIONS_KEY, JSON.stringify(conns));
  }

  async addConnection(conn: ConnectionMeta, secret?: string) {
    const conns = await this.listConnections();
    conns.push(conn);
    console.log('addConnection - before save:', conns); // Debug log
    await this.saveConnections(conns);
    console.log('addConnection - after save:', conns); // Debug log
    if (secret) await this.setSecret(conn.id, secret);
  }

  async editConnection(id: string, patch: Partial<ConnectionMeta>, secret?: string) {
    const conns = await this.listConnections();
    const idx = conns.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('connection not found');
    conns[idx] = { ...conns[idx], ...patch };
    await this.saveConnections(conns);
    if (secret !== undefined) {
      if (secret === '') await this.removeSecret(id);
      else await this.setSecret(id, secret);
    }
  }

  async removeConnection(id: string) {
    const conns = await this.listConnections();
    const filtered = conns.filter(c => c.id !== id);
    await this.saveConnections(filtered);
    await this.removeSecret(id);
  }

  async setSecret(id: string, value: string) {
    await this.context.secrets.store(this.secretKey(id), value);
  }

  async getSecret(id: string): Promise<string | undefined> {
    return this.context.secrets.get(this.secretKey(id));
  }

  async removeSecret(id: string) {
    await this.context.secrets.delete(this.secretKey(id));
  }

  private secretKey(id: string) {
    return `connectAdmin.secret.${id}`;
  }

  dispose() {
    // nothing to dispose (placeholder)
  }
}
