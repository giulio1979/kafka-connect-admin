import * as vscode from 'vscode';
import { ConnectionMeta, ConnectionType } from '../connectionStore';
import { ConnectionStore } from '../connectionStore';
import { ConnectClient } from '../clients/connectClient';
import { SchemaRegistryClient } from '../clients/schemaRegistryClient';

class ConnectionNode extends vscode.TreeItem {
  constructor(public readonly meta: ConnectionMeta) {
    super(meta.name, vscode.TreeItemCollapsibleState.Collapsed);
    // set a specific contextValue for schema-registry connections so menus can target them
    (this as any).contextValue = meta.type === 'schema-registry' ? 'connection.schemaRegistry' : 'connection';
    (this as any).isConnection = true;
    (this as any).meta = meta;
  }
}

class ConnectorNode extends vscode.TreeItem {
  constructor(public readonly name: string) {
    super(name, vscode.TreeItemCollapsibleState.None);
  (this as any).contextValue = 'connector';
  }
}

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private store?: ConnectionStore;
  private _onDidChangeTreeData: any = new (vscode as any).EventEmitter();
  readonly onDidChangeTreeData: any = this._onDidChangeTreeData.event;

  constructor(context?: vscode.ExtensionContext) {
    if (context) this.store = new ConnectionStore(context);
  }

  setContext(context: vscode.ExtensionContext) {
    if (!this.store) this.store = new ConnectionStore(context);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!this.store) return [];

    if (!element) {
      const conns = await this.store.listConnections();
      const nodes = conns.map(c => new ConnectionNode(c));
      return nodes;
    }

    // if element is a ConnectionNode, list connectors or subjects
    if ((element as any).isConnection) {
      const meta = (element as any).meta as ConnectionMeta;
      try {
        if (meta.type === 'connect') {
          const secret = await this.store.getSecret(meta.id);
          const headers: Record<string,string> = {};
          if (meta.authType === 'basic' && meta.username && secret) {
            headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
          } else if (meta.authType === 'bearer' && secret) {
            headers['Authorization'] = `Bearer ${secret}`;
          }
          const client = new ConnectClient({ baseUrl: meta.url, headers });
          const list = await client.listConnectors();
          return list.map(n => {
            const node = new ConnectorNode(n);
            (node as any).meta = meta;
            (node as any).name = n;
            // attach open command with a simple serializable payload (avoid passing the TreeItem itself)
            (node as any).command = { command: 'connectAdmin.openConnector', title: 'Open Connector', arguments: [{ meta, name: n }] };
            return node;
          });
        }
        if (meta.type === 'schema-registry') {
          const secret = await this.store.getSecret(meta.id);
          const headers: Record<string,string> = {};
          if (meta.authType === 'basic' && meta.username && secret) {
            headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
          } else if (meta.authType === 'bearer' && secret) {
            headers['Authorization'] = `Bearer ${secret}`;
          }
          const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
          const subjects = await client.listSubjects();
          try { const oc = (await import('../logger')).getOutputChannel(); oc.appendLine(`[tree] ${meta.name} subjects count ${subjects.length}`); } catch(_) {}
          return subjects.map(s => {
            const subjectNode = new vscode.TreeItem(s, vscode.TreeItemCollapsibleState.Collapsed);
            (subjectNode as any).meta = meta;
            (subjectNode as any).subject = s;
            (subjectNode as any).contextValue = 'schemaSubject';
            return subjectNode;
          });
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to load children for ${meta.name}: ${e.message || e}`);
        return [];
      }
    }

    // If element is a subject node, list versions
    if ((element as any).contextValue === 'schemaSubject') {
      const meta = (element as any).meta as ConnectionMeta;
      const subject = (element as any).subject as string;
      try {
        const secret = await this.store.getSecret(meta.id);
        const headers: Record<string,string> = {};
        if (meta.authType === 'basic' && meta.username && secret) {
          headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
        } else if (meta.authType === 'bearer' && secret) {
          headers['Authorization'] = `Bearer ${secret}`;
        }
  const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
        const versions = await client.getVersions(subject);
        return versions.map(v => {
          const versionNode = new vscode.TreeItem(`v${v}`, vscode.TreeItemCollapsibleState.None);
          (versionNode as any).meta = meta;
          (versionNode as any).subject = subject;
          (versionNode as any).version = v;
          (versionNode as any).contextValue = 'schemaVersion';
          // attach open command with a simple serializable payload
          (versionNode as any).command = { command: 'connectAdmin.openSchemaVersion', title: 'Open Schema Version', arguments: [{ meta, subject, version: v }] };
          return versionNode;
        });
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to load versions for ${subject}: ${e.message || e}`);
        return [];
      }
    }

    return [];
  }
}
