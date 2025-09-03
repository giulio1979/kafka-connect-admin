import * as vscode from 'vscode';

export type ConnectionType = 'connect' | 'schema-registry';

export interface ConnectionMeta {
  id: string;
  name: string;
  url: string;
  type: ConnectionType;
  authType?: 'none' | 'basic' | 'bearer';
  username?: string;
  password?: string; // ⚠️ WARNING: This will be stored as base64 in settings.json - NOT SECURE!
}

const CONNECTIONS_KEY = 'connectAdmin.connections.v1';
const SETTINGS_KEY = 'connectAdmin.connections';

export class ConnectionStore implements vscode.Disposable {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async listConnections(): Promise<ConnectionMeta[]> {
    // First try to get from workspace settings (user-visible)
    const config = (vscode as any).workspace.getConfiguration();
    const settingsConnections = config.get(SETTINGS_KEY) as ConnectionMeta[];
    
    if (settingsConnections && settingsConnections.length > 0) {
      console.log('listConnections from settings:', settingsConnections); // Debug log
      return settingsConnections;
    }
    
    // Fallback to internal state for backward compatibility
    const raw = this.context.globalState.get<string>(CONNECTIONS_KEY, '[]');
    try {
      const connections = JSON.parse(raw) as ConnectionMeta[];
      console.log('listConnections from internal state:', connections); // Debug log
      
      // If we have connections in internal state but not in settings, migrate them
      if (connections.length > 0) {
        await this.saveToSettings(connections);
      }
      
      return connections;
    } catch (e) {
      console.error('Error parsing connections:', e); // Debug log
      return [];
    }
  }

  private async saveConnections(conns: ConnectionMeta[]) {
    // Save to both internal state and workspace settings
    await this.context.globalState.update(CONNECTIONS_KEY, JSON.stringify(conns));
    await this.saveToSettings(conns);
  }
  
  private async saveToSettings(conns: ConnectionMeta[]) {
    // Save to workspace settings (visible in settings.json)
    const config = (vscode as any).workspace.getConfiguration();
    await config.update(SETTINGS_KEY, conns, (vscode as any).ConfigurationTarget.Workspace);
    
    console.log('Saved connections to settings.json:', conns); // Debug log
  }

  async addConnection(conn: ConnectionMeta, secret?: string) {
    const conns = await this.listConnections();
    
    // Save password to settings.json as base64 (Note: This is not secure - base64 is just encoding!)
    if (secret) {
      conn.password = Buffer.from(secret).toString('base64');
      console.log('Saving password to settings.json as base64');
    }
    
    conns.push(conn);
    console.log('addConnection - before save:', conns); // Debug log
    await this.saveConnections(conns);
    console.log('addConnection - after save:', conns); // Debug log
    
    // Also save to secure storage as backup/fallback
    if (secret) await this.setSecret(conn.id, secret);
  }

  async editConnection(id: string, patch: Partial<ConnectionMeta>, secret?: string) {
    const conns = await this.listConnections();
    const idx = conns.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('connection not found');
    
    // Save password to settings.json as base64 when updating
    if (secret) {
      patch.password = Buffer.from(secret).toString('base64');
      console.log('Updating password in settings.json as base64');
    }
    
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
    // First try to get from settings.json (base64 encoded)
    const conns = await this.listConnections();
    const conn = conns.find(c => c.id === id);
    if (conn && conn.password) {
      console.log('Reading password from settings.json');
      return Buffer.from(conn.password, 'base64').toString();
    }
    
    // Fallback to secure storage for backward compatibility
    const secureSecret = await this.context.secrets.get(this.secretKey(id));
    if (secureSecret) {
      console.log('Reading password from secure storage (fallback)');
      return secureSecret;
    }
    
    return undefined;
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
