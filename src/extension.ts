import * as vscode from 'vscode';
import { ConnectionStore, ConnectionMeta, ConnectionType } from './connectionStore';
import { ConnectionsTreeProvider } from './views/connectionsTree';
import { ConnectorView } from './views/connectorView';
import { OffsetEditor } from './views/offsetEditor';
import { getOutputChannel } from './logger';

export function activate(context: vscode.ExtensionContext) {
  const store = new ConnectionStore(context);

  const treeProvider = new ConnectionsTreeProvider(context);
  vscode.window.registerTreeDataProvider('connectAdmin.connections', treeProvider);
  const connectorView = new ConnectorView(context);
  const offsetEditor = new OffsetEditor(context);

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.hello', () => {
  vscode.window.showInformationMessage('Connect Admin extension activated');
  getOutputChannel().appendLine('[cmd] connectAdmin.hello invoked');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.refreshConnections', () => {
  getOutputChannel().appendLine('[cmd] refreshConnections invoked');
  treeProvider.refresh();
  }));

  // Create simple status bar buttons for quick access to Add and Refresh
  try {
    const addItem: any = (vscode as any).window.createStatusBarItem((vscode as any).StatusBarAlignment.Left, 100);
    addItem.command = 'connectAdmin.addConnection';
    addItem.text = '$(add) Add Connect';
    addItem.tooltip = 'Add a Connect or Schema-Registry connection';
    addItem.show();
    context.subscriptions.push(addItem);

    const refreshItem: any = (vscode as any).window.createStatusBarItem((vscode as any).StatusBarAlignment.Left, 99);
    refreshItem.command = 'connectAdmin.refreshConnections';
    refreshItem.text = '$(refresh) Refresh Connects';
    refreshItem.tooltip = 'Refresh connections list';
    refreshItem.show();
    context.subscriptions.push(refreshItem);
  } catch (e) {
    // ignore if StatusBar API isn't present in the shim
  }

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.addConnection', async () => {
  getOutputChannel().appendLine('[cmd] addConnection invoked');
    const name = await vscode.window.showInputBox({ prompt: 'Connection name' });
    if (!name) return;
    const typePick = await vscode.window.showQuickPick(['connect', 'schema-registry'], { placeHolder: 'Connection type' });
    if (!typePick) return;
    const url = await vscode.window.showInputBox({ prompt: 'Base URL (e.g. http://localhost:8083)' });
    if (!url) return;
    const auth = await vscode.window.showQuickPick(['none', 'basic', 'bearer'], { placeHolder: 'Auth type' });
    const id = `${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
    const meta: ConnectionMeta = { id, name, url, type: typePick as ConnectionType };
    if (auth && auth !== 'none') {
      meta.authType = auth as any;
      if (auth === 'basic') {
        const username = await vscode.window.showInputBox({ prompt: 'Username' });
        meta.username = username || undefined;
        const password = await vscode.window.showInputBox({ prompt: 'Password', password: true });
        if (password) await store.setSecret(id, password);
      } else if (auth === 'bearer') {
        const token = await vscode.window.showInputBox({ prompt: 'Token', password: true });
        if (token) await store.setSecret(id, token);
      }
    }
    await store.addConnection(meta);
    vscode.window.showInformationMessage(`Added connection ${name}`);
    treeProvider.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.removeConnection', async (node?: any) => {
  getOutputChannel().appendLine('[cmd] removeConnection invoked');
  let id: string | undefined;
    if (node && node.meta) id = node.meta.id;
    if (!id) {
      const conns = await store.listConnections();
      const pick = await vscode.window.showQuickPick(conns.map(c => ({ label: c.name, id: c.id } as any)), { placeHolder: 'Select connection to remove' });
      if (!pick) return;
      id = pick.id;
    }
    const confirmed = await vscode.window.showWarningMessage('Remove connection?', { modal: true }, 'Remove');
    if (confirmed !== 'Remove') return;
    if (!id) return;
    await store.removeConnection(id);
    vscode.window.showInformationMessage('Connection removed');
    treeProvider.refresh();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.testConnection', async (node?: any) => {
  getOutputChannel().appendLine('[cmd] testConnection invoked');
  let meta: ConnectionMeta | undefined;
    if (node && node.meta) meta = node.meta;
    if (!meta) {
      const conns = await store.listConnections();
      const pick = await vscode.window.showQuickPick(conns.map(c => ({ label: c.name, meta: c } as any)), { placeHolder: 'Select connection to test' }) as any;
      if (!pick) return;
      meta = pick.meta;
    }
    try {
      if (!meta) return vscode.window.showErrorMessage('No connection selected');
      // simple test: fetch root or subjects depending on type
      if (meta.type === 'connect') {
        const client = new (await import('./clients/connectClient')).ConnectClient({ baseUrl: meta.url });
        await client.listConnectors();
      } else {
        const client = new (await import('./clients/schemaRegistryClient')).SchemaRegistryClient({ baseUrl: meta.url });
        await client.listSubjects();
      }
      vscode.window.showInformationMessage(`Connection ${meta.name} OK`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Connection test failed: ${e.message || e}`);
    }
  }));

  // connector actions (node passed from tree)
  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.pause', async (node: any) => {
  getOutputChannel().appendLine(`[cmd] connector.pause invoked for ${node?.label}`);
  if (!node || !node.parent?.meta) return vscode.window.showErrorMessage('Connector node missing');
    const connMeta = node.parent.meta as ConnectionMeta;
    const client = new (await import('./clients/connectClient')).ConnectClient({ baseUrl: connMeta.url });
    try {
      await client.pauseConnector(node.label);
      vscode.window.showInformationMessage(`Paused ${node.label}`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Pause failed: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.resume', async (node: any) => {
  getOutputChannel().appendLine(`[cmd] connector.resume invoked for ${node?.label}`);
  if (!node || !node.parent?.meta) return vscode.window.showErrorMessage('Connector node missing');
    const connMeta = node.parent.meta as ConnectionMeta;
    const client = new (await import('./clients/connectClient')).ConnectClient({ baseUrl: connMeta.url });
    try {
      await client.resumeConnector(node.label);
      vscode.window.showInformationMessage(`Resumed ${node.label}`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Resume failed: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.showOffsets', async (node: any) => {
    getOutputChannel().appendLine(`[cmd] connector.showOffsets invoked for ${node?.label}`);
    if (!node || !node.parent?.meta) return vscode.window.showErrorMessage('Connector node missing');
    const connMeta = node.parent.meta as ConnectionMeta;
    try {
      await offsetEditor.open(connMeta, node.label);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to open offsets editor: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openConnector', async (node: any) => {
    if (!node || !node.parent?.meta) return vscode.window.showErrorMessage('Connector node missing');
    const connMeta = node.parent.meta as any;
    await connectorView.open(connMeta, node.label);
  }));

  context.subscriptions.push(store);
}

export function deactivate() {
  // nothing to clean up yet
}
