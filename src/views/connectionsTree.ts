import * as vscode from 'vscode';
import { ConnectionMeta, ConnectionType } from '../connectionStore';
import { ConnectionStore } from '../connectionStore';
import { ConnectClient } from '../clients/connectClient';
import { SchemaRegistryClient } from '../clients/schemaRegistryClient';

class ConnectionNode extends vscode.TreeItem {
  constructor(public readonly meta: ConnectionMeta) {
    super(meta.name, vscode.TreeItemCollapsibleState.Collapsed);
    (this as any).contextValue = 'connection';
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
    if ((element as any).meta) {
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
            (node as any).parent = element;
            // attach open command so clicking opens the connector view
            (node as any).command = { command: 'connectAdmin.openConnector', title: 'Open Connector', arguments: [node] };
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
          const client = new SchemaRegistryClient({ baseUrl: meta.url, headers });
          const subjects = await client.listSubjects();
          return subjects.map(s => {
            const node = new ConnectorNode(s);
            (node as any).parent = element;
            return node;
          });
        }
      } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to load children for ${meta.name}: ${e.message || e}`);
        return [];
      }
    }

    return [];
  }
}
