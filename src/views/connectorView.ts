import * as vscode from 'vscode';
import { ConnectClient } from '../clients/connectClient';
import { ConnectionMeta } from '../connectionStore';
import { OffsetEditor } from './offsetEditor';
import { getOutputChannel } from '../logger';

export class ConnectorView {
  private panel?: any;
  constructor(private context: vscode.ExtensionContext) {}

  public async open(connMeta: ConnectionMeta, connectorName: string) {
    const id = `connector-${connMeta.id}-${connectorName}`.replace(/[^a-z0-9\-]/gi, '-');
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = (vscode as any).window.createWebviewPanel(
        'connectorView',
        `${connectorName}`,
        { viewColumn: (vscode as any).ViewColumn.One, preserveFocus: false },
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

    // fetch status and offsets
    let status = {};
    let offsets = {};
    try {
      status = await client.getStatus(connectorName);
    } catch (e) { status = { error: String(e) }; }
    try {
      offsets = await client.getOffsets(connectorName);
    } catch (e) { offsets = { error: String(e) }; }

  const html = this.renderHtml(connectorName, connMeta, status, offsets);
    this.panel!.webview.html = html;

    // handle messages from the webview for actions
    this.panel!.webview.onDidReceiveMessage(async (msg: any) => {
      try {
        getOutputChannel().appendLine(`[webview] received ${msg.cmd} for ${connectorName}`);
        if (msg.cmd === 'pause') {
          await client.pauseConnector(connectorName);
          getOutputChannel().appendLine(`[action] paused ${connectorName}`);
        } else if (msg.cmd === 'resume') {
          await client.resumeConnector(connectorName);
          getOutputChannel().appendLine(`[action] resumed ${connectorName}`);
        } else if (msg.cmd === 'stop') {
          await client.stopConnector(connectorName);
          getOutputChannel().appendLine(`[action] stopped ${connectorName}`);
        } else if (msg.cmd === 'restart') {
          const res = await client.restartConnector(connectorName, true, false);
          getOutputChannel().appendLine(`[action] restarted ${connectorName}`);
          this.panel!.webview.postMessage({ cmd: 'update', status: await client.getStatus(connectorName), offsets: await client.getOffsets(connectorName), restartResult: res });
        } else if (msg.cmd === 'editOffsets') {
          // open the editable offsets editor
          const editor = new OffsetEditor(this.context);
          await editor.open(connMeta, connectorName);
          getOutputChannel().appendLine(`[action] opened offsets editor for ${connectorName}`);
        } else if (msg.cmd === 'refresh') {
          const newStatus = await client.getStatus(connectorName);
          const newOffsets = await client.getOffsets(connectorName);
          this.panel!.webview.postMessage({ cmd: 'update', status: newStatus, offsets: newOffsets });
          getOutputChannel().appendLine(`[action] refreshed ${connectorName}`);
        } else if (msg.cmd === 'patchOffsets') {
          let body: any;
          try {
            body = JSON.parse(msg.payload);
          } catch (e: any) {
            this.panel!.webview.postMessage({ cmd: 'error', message: 'Invalid JSON: ' + (e.message || String(e)) });
            return;
          }
          try {
            const res = await client.setOffsetsMethod(connectorName, body, 'PATCH');
            getOutputChannel().appendLine(`[action] PATCH offsets for ${connectorName}: ${JSON.stringify(res)}`);
            // auto-refresh after save
            const newStatus = await client.getStatus(connectorName);
            const newOffsets = await client.getOffsets(connectorName);
            this.panel!.webview.postMessage({ cmd: 'update', status: newStatus, offsets: newOffsets });
          } catch (e: any) {
            getOutputChannel().appendLine(`[error] PATCH offsets failed: ${e.message || String(e)}`);
            this.panel!.webview.postMessage({ cmd: 'error', message: e.message || String(e) });
          }
        }
      } catch (e: any) {
        getOutputChannel().appendLine(`[error] webview action failed: ${e.message || String(e)}`);
        this.panel!.webview.postMessage({ cmd: 'error', message: e.message || String(e) });
      }
    });
  }

  private renderHtml(name: string, connMeta: ConnectionMeta, status: any, offsets: any) {
    // JSON.stringify can contain U+2028/U+2029 which break JS string literals when
    // the HTML is injected via document.write; also escape '<' and backticks.
    const safe = (v: any) => JSON.stringify(v, null, 2)
      .replace(/</g, '&lt;')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029')
      .replace(/`/g, '&#96;');

    return `<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>
      body{font-family:Segoe UI,Arial;margin:12px}
      .btn-group { margin-bottom: 16px; }
      button { padding: 6px 16px; margin-right: 8px; border-radius: 4px; border: 1px solid #ccc; background: #f6f8fa; cursor: pointer; font-size: 15px; }
      button#stop { background: #ffeaea; border-color: #e57373; color: #c62828; }
      button#pause { background: #fffbe6; border-color: #ffd54f; color: #f9a825; }
      button#resume { background: #e8f5e9; border-color: #81c784; color: #388e3c; }
      button#restart { background: #e3f2fd; border-color: #64b5f6; color: #1976d2; }
      button#saveOffsets { background: #e0f7fa; border-color: #4dd0e1; color: #00838f; }
      button#editOffsets { background: #fffde7; border-color: #ffd54f; color: #fbc02d; }
      button:active { filter: brightness(0.95); }
      textarea { width: 100%; font-family: monospace; font-size: 15px; padding: 8px; border-radius: 4px; border: 1px solid #ccc; margin-top: 8px; margin-bottom: 8px; }
      #statusArea { height: 120px; resize: vertical; background: #f6f8fa; }
      #offsetsEditor { height: 180px; resize: vertical; }
    </style>
    </head>
    <body>
    <h2>${name}</h2>
    <div class="btn-group">
      <button id="stop">Stop</button>
      <button id="pause">Pause</button>
      <button id="resume">Resume</button>
      <button id="restart">Restart</button>
      <button id="refresh">Refresh</button>
    </div>
    <div id="errorMsg" style="display:none;margin-bottom:12px;padding:8px 12px;border-radius:4px;background:#ffebee;color:#c62828;font-weight:bold;"></div>
    <div id="connState" style="margin-bottom:12px;font-size:16px;font-weight:bold;padding:6px 12px;border-radius:4px;background:#e3f2fd;color:#1976d2;display:inline-block;">
      State: ${typeof status === 'object' && status && status.connector && status.connector.state ? status.connector.state : 'unknown'}
    </div>
  <!-- Status removed as requested -->
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
    <h3 style="margin:0;">Offsets</h3>
    <button id="editOffsets">Edit</button>
    <button id="saveOffsets" style="display:none">Save</button>
  </div>
  <textarea id="offsetsEditor" readonly>${safe(offsets)}</textarea>

    <script>
    (function(){
      const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
      function safePost(msg){ if (vscode && typeof vscode.postMessage === 'function') try{ vscode.postMessage(msg); }catch(e){} }
      document.addEventListener('DOMContentLoaded', function(){
        // Auto-refresh status every 15 seconds
        setInterval(() => {
          safePost({ cmd: 'refresh' });
        }, 15000);
        const pause = document.getElementById('pause');
        const resume = document.getElementById('resume');
        const refresh = document.getElementById('refresh');
        const stopBtn = document.getElementById('stop');
        const restartBtn = document.getElementById('restart');
        const saveOffsetsBtn = document.getElementById('saveOffsets');
        const editOffsetsBtn = document.getElementById('editOffsets');
        const offsetsEditor = document.getElementById('offsetsEditor');
        function clearError() {
          const errorDiv = document.getElementById('errorMsg');
          if (errorDiv) errorDiv.style.display = 'none';
        }
        if (pause) pause.addEventListener('click', () => { clearError(); safePost({ cmd: 'pause' }); });
        if (resume) resume.addEventListener('click', () => { clearError(); safePost({ cmd: 'resume' }); });
        if (stopBtn) stopBtn.addEventListener('click', () => { clearError(); safePost({ cmd: 'stop' }); });
        if (restartBtn) restartBtn.addEventListener('click', () => { clearError(); safePost({ cmd: 'restart' }); });
        if (refresh) refresh.addEventListener('click', () => { clearError(); safePost({ cmd: 'refresh' }); });
        if (editOffsetsBtn && offsetsEditor && saveOffsetsBtn) {
          editOffsetsBtn.addEventListener('click', () => {
            clearError();
            offsetsEditor.readOnly = false;
            offsetsEditor.focus();
            editOffsetsBtn.style.display = 'none';
            saveOffsetsBtn.style.display = '';
          });
        }
        if (saveOffsetsBtn && offsetsEditor && editOffsetsBtn) {
          saveOffsetsBtn.addEventListener('click', () => {
            clearError();
            safePost({ cmd: 'patchOffsets', payload: offsetsEditor.value });
            offsetsEditor.readOnly = true;
            editOffsetsBtn.style.display = '';
            saveOffsetsBtn.style.display = 'none';
          });
        }
        window.addEventListener('message', event => {
          const msg = event.data;
          // error handling
          const errorDiv = document.getElementById('errorMsg');
          if (msg.error || (msg.cmd === 'error' && msg.message)) {
            if (errorDiv) {
              errorDiv.textContent = msg.error || msg.message;
              errorDiv.style.display = '';
            }
          } else {
            if (errorDiv) errorDiv.style.display = 'none';
          }
          if (msg.cmd === 'update') {
            const s = document.getElementById('statusArea');
            const o = document.getElementById('offsetsEditor');
            if (s) s.value = JSON.stringify(msg.status, null, 2);
            if (o) o.value = JSON.stringify(msg.offsets, null, 2);
            if (o) o.readOnly = true;
            const editBtn = document.getElementById('editOffsets');
            const saveBtn = document.getElementById('saveOffsets');
            if (editBtn) editBtn.style.display = '';
            if (saveBtn) saveBtn.style.display = 'none';
            // update connector state field
            const connStateDiv = document.getElementById('connState');
            let state = 'unknown';
            try {
              const st = msg.status;
              if (st && st.connector && st.connector.state) state = st.connector.state;
            } catch {}
            if (connStateDiv) connStateDiv.textContent = 'State: ' + state;
          }
        });
      });
    })();
    </script>
    </body>
    </html>`;
  }
}
