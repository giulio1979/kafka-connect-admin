import * as vscode from 'vscode';
import { ConnectionMeta } from '../connectionStore';

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: vscode.TreeItem | undefined): vscode.ProviderResult<vscode.TreeItem[]> {
    // placeholder: real implementation will query ConnectionStore
    if (!element) {
      const connectRoot = new vscode.TreeItem('Connect Clusters', vscode.TreeItemCollapsibleState.Collapsed);
      const registryRoot = new vscode.TreeItem('Schema Registries', vscode.TreeItemCollapsibleState.Collapsed);
      return [connectRoot, registryRoot];
    }
    return [];
  }
}
