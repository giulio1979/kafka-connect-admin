import * as vscode from 'vscode';
import { ConnectionStore } from './connectionStore';

export function activate(context: vscode.ExtensionContext) {
  const store = new ConnectionStore(context);

  const disposable = vscode.commands.registerCommand('connectAdmin.hello', () => {
    vscode.window.showInformationMessage('Connect Admin extension activated');
  });

  context.subscriptions.push(disposable);
  context.subscriptions.push(store);
}

export function deactivate() {
  // nothing to clean up yet
}
