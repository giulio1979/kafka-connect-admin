import * as vscode from 'vscode';
import { ConnectClient } from '../clients/connectClient';
import { ConnectionMeta } from '../connectionStore';
import { getOutputChannel } from '../logger';

export class OffsetEditor {
  private panel?: any;
  constructor(private context: vscode.ExtensionContext) {}

  public async open(connMeta: ConnectionMeta, connectorName: string) {
    const id = `offsets-${connMeta.id}-${connectorName}`.replace(/[^a-z0-9\-]/gi, '-');
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = (vscode as any).window.createWebviewPanel(
        'offsetEditor',
        `Offsets: ${connectorName}`,
        { viewColumn: (vscode as any).ViewColumn.Active, preserveFocus: false },
        { enableScripts: true }
      );
      this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    const secret = await this.context.secrets.get(`connectAdmin.secret.${connMeta.id}`);
    const headers: Record<string,string> = {};
    if (connMeta.authType === 'basic' && connMeta.username && secret) {
      headers['Authorization'] = 'Basic ' + Buffer.from(connMeta.username + ':' + secret).toString('base64');
    } else if (connMeta.authType === 'bearer' && secret) {
      headers['Authorization'] = `Bearer ${secret}`;
    }
    const client = new ConnectClient({ baseUrl: connMeta.url, headers });

    let offsets: any = {};
    try {
      offsets = await client.getOffsets(connectorName);
    } catch (e: any) {
      offsets = { error: String(e) };
    }

    this.panel.webview.html = this.renderHtml(connectorName, offsets);

  this.panel.webview.onDidReceiveMessage(async (msg: any) => {
      try {
        getOutputChannel().appendLine(`[offsets webview] received ${msg.cmd} for ${connectorName}`);
  if (msg.cmd === 'validate') {
          try {
            JSON.parse(msg.payload);
            this.panel.webview.postMessage({ cmd: 'validateResult', ok: true });
          } catch (e: any) {
            this.panel.webview.postMessage({ cmd: 'validateResult', ok: false, message: e.message || String(e) });
          }
  } else if (msg.cmd === 'apply') {
          // parse and send to Connect
          let body: any;
          try {
            body = JSON.parse(msg.payload);
          } catch (e: any) {
            this.panel.webview.postMessage({ cmd: 'applyResult', success: false, message: 'Invalid JSON: ' + (e.message || String(e)) });
            return;
          }
          // legacy apply uses setOffsets (keeps existing behavior)
          try {
            const res = await client.setOffsets(connectorName, body);
            getOutputChannel().appendLine(`[offsets] Applied offsets for ${connectorName}: ${JSON.stringify(res)}`);
            this.panel.webview.postMessage({ cmd: 'applyResult', success: true, result: res });
          } catch (e: any) {
            getOutputChannel().appendLine(`[error] apply offsets failed: ${e.message || String(e)}`);
            this.panel.webview.postMessage({ cmd: 'applyResult', success: false, message: e.message || String(e) });
          }
        } else if (msg.cmd === 'refresh') {
          try {
            const newOffsets = await client.getOffsets(connectorName);
            this.panel.webview.postMessage({ cmd: 'refreshResult', offsets: newOffsets });
          } catch (e: any) {
            this.panel.webview.postMessage({ cmd: 'refreshResult', error: e.message || String(e) });
          }
        } else if (msg.cmd === 'sendMethod') {
          // msg.method: 'PUT' | 'POST' | 'PATCH'
          let body: any;
          try {
            body = JSON.parse(msg.payload);
          } catch (e: any) {
            this.panel.webview.postMessage({ cmd: 'applyResult', success: false, message: 'Invalid JSON: ' + (e.message || String(e)) });
            return;
          }
          try {
            const res = await client.setOffsetsMethod(connectorName, body, msg.method);
            getOutputChannel().appendLine(`[offsets] setOffsets ${msg.method} for ${connectorName}: ${JSON.stringify(res)}`);
            this.panel.webview.postMessage({ cmd: 'applyResult', success: true, result: res });
          } catch (e: any) {
            getOutputChannel().appendLine(`[error] setOffsets ${msg.method} failed: ${e.message || String(e)}`);
            this.panel.webview.postMessage({ cmd: 'applyResult', success: false, message: e.message || String(e) });
          }
        } else if (msg.cmd === 'stopConnector') {
          try {
            await client.stopConnector(connectorName);
            this.panel.webview.postMessage({ cmd: 'applyResult', success: true, result: { stopped: true } });
          } catch (e: any) {
            getOutputChannel().appendLine(`[error] stopConnector failed: ${e.message || String(e)}`);
            this.panel.webview.postMessage({ cmd: 'applyResult', success: false, message: e.message || String(e) });
          }
        }
      } catch (e: any) {
        getOutputChannel().appendLine(`[error] offsets webview message handler failed: ${e.message || String(e)}`);
      }
    });
  }

  private renderHtml(name: string, offsets: any) {
    const payload = JSON.stringify(offsets, null, 2).replace(/</g, '&lt;');
    return `<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>body{font-family:Segoe UI,Arial;margin:12px}textarea{width:100%;height:60vh;font-family:monospace;padding:8px;border-radius:4px}button{margin-right:8px}</style>
    </head>
    <body>
      <h2>Offsets: ${name}</h2>
      <div>
        <button id="validate">Validate</button>
        <button id="put">PUT</button>
        <button id="post">POST</button>
        <button id="patch">PATCH</button>
        <button id="stopConnector" style="margin-left:12px">Stop Connector</button>
        <button id="refresh" style="margin-left:8px">Refresh</button>
        <span id="status" style="margin-left:12px;color:#666"></span>
      </div>
      <textarea id="editor">${payload}</textarea>

      <script>
        const vscode = acquireVsCodeApi && acquireVsCodeApi();
        const editor = document.getElementById('editor');
        const status = document.getElementById('status');
        document.getElementById('validate').addEventListener('click', () => {
          const val = editor.value;
          vscode.postMessage({ cmd: 'validate', payload: val });
        });
        const sendMethod = (m) => { const val = editor.value; vscode.postMessage({ cmd: 'sendMethod', method: m, payload: val }); };
        document.getElementById('put').addEventListener('click', () => sendMethod('PUT'));
        document.getElementById('post').addEventListener('click', () => sendMethod('POST'));
        document.getElementById('patch').addEventListener('click', () => sendMethod('PATCH'));
        document.getElementById('stopConnector').addEventListener('click', () => { vscode.postMessage({ cmd: 'stopConnector' }); });
        document.getElementById('refresh').addEventListener('click', () => {
          vscode.postMessage({ cmd: 'refresh' });
        });

        window.addEventListener('message', event => {
          const msg = event.data;
          if (msg.cmd === 'validateResult') {
            if (msg.ok) { status.textContent = 'Valid JSON'; status.style.color = 'green'; }
            else { status.textContent = 'Invalid JSON: ' + (msg.message || ''); status.style.color = 'red'; }
          }
          if (msg.cmd === 'applyResult') {
            if (msg.success) { status.textContent = 'Applied successfully'; status.style.color = 'green'; }
            else { status.textContent = 'Apply failed: ' + (msg.message || ''); status.style.color = 'red'; }
          }
          if (msg.cmd === 'refreshResult') {
            if (msg.error) { status.textContent = 'Refresh failed: ' + msg.error; status.style.color='red'; }
            else { editor.value = JSON.stringify(msg.offsets, null, 2); status.textContent = 'Refreshed'; status.style.color='green'; }
          }
        });
      </script>
    </body>
    </html>`;
  }
}
