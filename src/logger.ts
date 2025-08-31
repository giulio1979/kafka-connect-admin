import * as vscode from 'vscode';

let channel: any = undefined;

export function getOutputChannel() {
  if (!channel) {
    try {
      channel = (vscode as any).window.createOutputChannel('Connect Admin');
    } catch (e) {
      // fallback no-op
      channel = { appendLine: (_: string) => {}, show: (_?: boolean) => {} };
    }
  }
  return channel;
}
