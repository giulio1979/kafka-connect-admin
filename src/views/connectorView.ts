import * as vscode from 'vscode';
import { ConnectClient } from '../clients/connectClient';
import { ConnectionMeta } from '../connectionStore';
import { OffsetEditor } from './offsetEditor';
import { getOutputChannel } from '../logger';

export class ConnectorView {
  private panels: Map<string, any> = new Map();
  constructor(private context: vscode.ExtensionContext) {}

  public async open(connMeta: ConnectionMeta, connectorName: string, store: any) {
    const id = `connector-${connMeta.id}-${connectorName}`.replace(/[^a-z0-9\-]/gi, '-');
    
    // Check if a panel already exists for this specific connector
    let panel = this.panels.get(id);
    if (panel) {
      panel.reveal();
      return; // Don't reprocess if panel already exists and is being revealed
    } else {
      panel = (vscode as any).window.createWebviewPanel(
        'connectorView',
        `${connectorName}`,
        { viewColumn: (vscode as any).ViewColumn.One, preserveFocus: false },
        { enableScripts: true }
      );
      this.panels.set(id, panel);
      panel.onDidDispose(() => { this.panels.delete(id); });
    }

    const secret = await store.getSecret(connMeta.id);
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
    panel.webview.html = html;

    // handle messages from the webview for actions
    panel.webview.onDidReceiveMessage(async (msg: any) => {
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
          panel.webview.postMessage({ cmd: 'update', status: await client.getStatus(connectorName), offsets: await client.getOffsets(connectorName), restartResult: res });
        } else if (msg.cmd === 'editOffsets') {
          // open the editable offsets editor
          const editor = new OffsetEditor(this.context);
          await editor.open(connMeta, connectorName);
          getOutputChannel().appendLine(`[action] opened offsets editor for ${connectorName}`);
        } else if (msg.cmd === 'refresh') {
          const newStatus = await client.getStatus(connectorName);
          const newOffsets = await client.getOffsets(connectorName);
          panel.webview.postMessage({ cmd: 'update', status: newStatus, offsets: newOffsets });
          getOutputChannel().appendLine(`[action] refreshed ${connectorName}`);
        } else if (msg.cmd === 'patchOffsets') {
          let body: any;
          try {
            body = JSON.parse(msg.payload);
          } catch (e: any) {
            panel.webview.postMessage({ cmd: 'error', message: 'Invalid JSON: ' + (e.message || String(e)) });
            return;
          }
          try {
            const res = await client.setOffsetsMethod(connectorName, body, 'PATCH');
            getOutputChannel().appendLine(`[action] PATCH offsets for ${connectorName}: ${JSON.stringify(res)}`);
            // auto-refresh after save
            const newStatus = await client.getStatus(connectorName);
            const newOffsets = await client.getOffsets(connectorName);
            panel.webview.postMessage({ cmd: 'update', status: newStatus, offsets: newOffsets });
          } catch (e: any) {
            getOutputChannel().appendLine(`[error] PATCH offsets failed: ${e.message || String(e)}`);
            panel.webview.postMessage({ cmd: 'error', message: e.message || String(e) });
          }
        }
      } catch (e: any) {
        getOutputChannel().appendLine(`[error] webview action failed: ${e.message || String(e)}`);
        panel.webview.postMessage({ cmd: 'error', message: e.message || String(e) });
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

    // Determine connector state and colors
    const connectorState = typeof status === 'object' && status && status.connector && status.connector.state ? status.connector.state : 'UNKNOWN';
    let stateColor = 'var(--vscode-button-secondaryBackground)';
    let stateTextColor = 'var(--vscode-button-secondaryForeground)';
    
    switch (connectorState) {
      case 'RUNNING':
        stateColor = 'var(--vscode-testing-iconPassed)';
        stateTextColor = 'white';
        break;
      case 'FAILED':
      case 'DESTROYED':
        stateColor = 'var(--vscode-testing-iconFailed)';
        stateTextColor = 'white';
        break;
      case 'PAUSED':
        stateColor = 'var(--vscode-notificationsWarningIcon-foreground)';
        stateTextColor = 'white';
        break;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Connector: ${name}</title>
    <style>
      body { 
        font-family: 'Segoe UI', Arial, sans-serif; 
        margin: 16px; 
        background-color: var(--vscode-editor-background); 
        color: var(--vscode-editor-foreground); 
        line-height: 1.4;
      }
      
      .header { 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        margin-bottom: 24px; 
        padding-bottom: 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }
      
      .header h1 { 
        margin: 0; 
        color: var(--vscode-foreground); 
        font-size: 24px; 
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .status-badge {
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        background: ${stateColor};
        color: ${stateTextColor};
      }
      
      .toolbar { 
        display: flex; 
        gap: 8px; 
        flex-wrap: wrap;
      }
      
      .btn { 
        padding: 8px 16px; 
        border: 1px solid var(--vscode-button-border); 
        background: var(--vscode-button-background); 
        color: var(--vscode-button-foreground); 
        border-radius: 4px; 
        cursor: pointer; 
        font-size: 13px; 
        font-weight: 500;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .btn:hover { 
        background: var(--vscode-button-hoverBackground); 
        transform: translateY(-1px);
      }
      
      .btn:active { 
        transform: translateY(0);
      }
      
      .btn:disabled { 
        opacity: 0.6; 
        cursor: not-allowed; 
        transform: none !important;
      }
      
      .btn.danger { 
        background: var(--vscode-testing-iconFailed); 
        color: white; 
        border-color: var(--vscode-testing-iconFailed);
      }
      
      .btn.warning { 
        background: var(--vscode-notificationsWarningIcon-foreground); 
        color: white; 
        border-color: var(--vscode-notificationsWarningIcon-foreground);
      }
      
      .btn.success { 
        background: var(--vscode-testing-iconPassed); 
        color: white; 
        border-color: var(--vscode-testing-iconPassed);
      }
      
      .btn.primary { 
        background: var(--vscode-button-background); 
        color: var(--vscode-button-foreground); 
        border-color: var(--vscode-button-border);
      }
      
      .btn.secondary { 
        background: var(--vscode-button-secondaryBackground); 
        color: var(--vscode-button-secondaryForeground);
        border-color: var(--vscode-button-border);
      }
      
      .error-banner { 
        margin-bottom: 16px; 
        padding: 12px; 
        border-radius: 6px; 
        background: var(--vscode-inputValidation-errorBackground); 
        border: 1px solid var(--vscode-inputValidation-errorBorder); 
        color: var(--vscode-inputValidation-errorForeground);
        display: none;
        animation: slideDown 0.2s ease-out;
      }
      
      .error-banner.show { 
        display: block; 
      }
      
      @keyframes slideDown { 
        from { opacity: 0; transform: translateY(-10px); } 
        to { opacity: 1; transform: translateY(0); } 
      }
      
      .section { 
        margin-bottom: 24px; 
        padding: 16px; 
        border: 1px solid var(--vscode-panel-border); 
        border-radius: 6px; 
        background: var(--vscode-editor-background);
      }
      
      .section-header { 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        margin-bottom: 16px; 
      }
      
      .section-title { 
        margin: 0; 
        font-size: 16px; 
        font-weight: 600; 
        color: var(--vscode-foreground);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .section-actions { 
        display: flex; 
        gap: 8px; 
      }
      
      .code-block { 
        background: var(--vscode-textCodeBlock-background); 
        border: 1px solid var(--vscode-panel-border); 
        border-radius: 4px; 
        font-family: 'Fira Code', 'Consolas', 'Courier New', monospace; 
        font-size: 13px; 
        line-height: 1.4;
        overflow: auto;
        max-height: 400px;
      }
      
      .code-block textarea { 
        width: 100%; 
        min-height: 200px; 
        padding: 12px; 
        border: none; 
        background: transparent; 
        color: var(--vscode-editor-foreground); 
        font-family: inherit; 
        font-size: inherit; 
        line-height: inherit;
        resize: vertical;
        outline: none;
      }
      
      .code-block textarea:focus { 
        background: var(--vscode-input-background); 
      }
      
      .code-block pre { 
        margin: 0; 
        padding: 12px; 
        white-space: pre-wrap; 
        word-wrap: break-word;
      }
      
      .details-section { 
        margin-top: 8px;
      }
      
      .details-summary { 
        font-weight: 600; 
        cursor: pointer; 
        padding: 8px 0; 
        color: var(--vscode-foreground);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .details-summary:hover { 
        color: var(--vscode-button-background); 
      }
      
      .auto-refresh-info {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        font-style: italic;
        margin-top: 8px;
      }
      
      .connection-info {
        background: var(--vscode-editor-inactiveSelectionBackground);
        border-left: 4px solid var(--vscode-button-background);
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 24px;
        font-size: 13px;
      }
      
      .connection-info strong {
        color: var(--vscode-foreground);
      }
    </style>
</head>
<body>
    <div class="header">
        <h1>
            <span>🔗</span>
            ${name}
            <span class="status-badge" id="statusBadge">${connectorState}</span>
        </h1>
        <div class="toolbar">
            <button id="refresh" class="btn secondary">🔄 Refresh</button>
            <button id="pause" class="btn warning">⏸️ Pause</button>
            <button id="resume" class="btn success">▶️ Resume</button>
            <button id="restart" class="btn primary">🔄 Restart</button>
            <button id="stop" class="btn danger">⏹️ Stop</button>
        </div>
    </div>
    
    <div class="connection-info">
        <strong>Connection:</strong> ${connMeta.name} (${connMeta.url})
    </div>
    
    <div id="errorBanner" class="error-banner">
        <strong>Error:</strong> <span id="errorMessage"></span>
    </div>
    
    <div class="section">
        <div class="section-header">
            <h2 class="section-title">📊 Connector Status</h2>
        </div>
        <div class="details-section">
            <details>
                <summary class="details-summary">📋 View Detailed Status (JSON)</summary>
                <div class="code-block">
                    <pre id="detailedStatus">${safe(status)}</pre>
                </div>
            </details>
        </div>
        <div class="auto-refresh-info">
            ℹ️ Status automatically refreshes every 15 seconds
        </div>
    </div>
    
    <div class="section">
        <div class="section-header">
            <h2 class="section-title">⚡ Consumer Offsets</h2>
            <div class="section-actions">
                <button id="editOffsets" class="btn secondary">✏️ Edit</button>
                <button id="saveOffsets" class="btn primary" style="display: none;">💾 Save</button>
            </div>
        </div>
        <div class="code-block">
            <textarea id="offsetsEditor" readonly placeholder="Loading offsets...">${safe(offsets)}</textarea>
        </div>
    </div>

    <script>
    (function(){
      const vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
      function safePost(msg){ if (vscode && typeof vscode.postMessage === 'function') try{ vscode.postMessage(msg); }catch(e){} }
      
      // UI elements
      const errorBanner = document.getElementById('errorBanner');
      const errorMessage = document.getElementById('errorMessage');
      const statusBadge = document.getElementById('statusBadge');
      const detailedStatus = document.getElementById('detailedStatus');
      const offsetsEditor = document.getElementById('offsetsEditor');
      const editOffsetsBtn = document.getElementById('editOffsets');
      const saveOffsetsBtn = document.getElementById('saveOffsets');
      
      // Utility functions
      function showError(message) {
        if (errorMessage && errorBanner) {
          errorMessage.textContent = message;
          errorBanner.className = 'error-banner show';
        }
      }
      
      function hideError() {
        if (errorBanner) {
          errorBanner.className = 'error-banner';
        }
      }
      
      function updateStatusBadge(state) {
        if (!statusBadge) return;
        statusBadge.textContent = state || 'UNKNOWN';
        
        // Update badge colors
        statusBadge.style.background = 'var(--vscode-button-secondaryBackground)';
        statusBadge.style.color = 'var(--vscode-button-secondaryForeground)';
        
        switch (state) {
          case 'RUNNING':
            statusBadge.style.background = 'var(--vscode-testing-iconPassed)';
            statusBadge.style.color = 'white';
            break;
          case 'FAILED':
          case 'DESTROYED':
            statusBadge.style.background = 'var(--vscode-testing-iconFailed)';
            statusBadge.style.color = 'white';
            break;
          case 'PAUSED':
            statusBadge.style.background = 'var(--vscode-notificationsWarningIcon-foreground)';
            statusBadge.style.color = 'white';
            break;
        }
      }
      
      function setButtonLoading(button, loading) {
        if (!button) return;
        button.disabled = loading;
        if (loading) {
          button.style.opacity = '0.6';
        } else {
          button.style.opacity = '1';
        }
      }
      
      // Event listeners
      document.addEventListener('DOMContentLoaded', function(){
        // Auto-refresh status every 15 seconds
        setInterval(() => {
          safePost({ cmd: 'refresh' });
        }, 15000);
        
        // Action buttons
        const buttons = ['pause', 'resume', 'stop', 'restart', 'refresh'];
        buttons.forEach(action => {
          const btn = document.getElementById(action);
          if (btn) {
            btn.addEventListener('click', () => {
              hideError();
              setButtonLoading(btn, true);
              safePost({ cmd: action });
              
              // Re-enable button after 3 seconds to prevent hanging
              setTimeout(() => setButtonLoading(btn, false), 3000);
            });
          }
        });
        
        // Offsets editing
        if (editOffsetsBtn && offsetsEditor && saveOffsetsBtn) {
          editOffsetsBtn.addEventListener('click', () => {
            hideError();
            offsetsEditor.readOnly = false;
            offsetsEditor.focus();
            offsetsEditor.style.background = 'var(--vscode-input-background)';
            editOffsetsBtn.style.display = 'none';
            saveOffsetsBtn.style.display = 'inline-flex';
          });
          
          saveOffsetsBtn.addEventListener('click', () => {
            hideError();
            setButtonLoading(saveOffsetsBtn, true);
            safePost({ cmd: 'patchOffsets', payload: offsetsEditor.value });
          });
        }
        
        // Message handling
        window.addEventListener('message', event => {
          const msg = event.data;
          
          // Handle errors
          if (msg.error || (msg.cmd === 'error' && msg.message)) {
            showError(msg.error || msg.message);
            // Re-enable all buttons
            document.querySelectorAll('button').forEach(btn => setButtonLoading(btn, false));
          } else {
            hideError();
          }
          
          // Handle updates
          if (msg.cmd === 'update') {
            if (detailedStatus) {
              detailedStatus.textContent = JSON.stringify(msg.status, null, 2);
            }
            
            if (offsetsEditor) {
              offsetsEditor.value = JSON.stringify(msg.offsets, null, 2);
              offsetsEditor.readOnly = true;
              offsetsEditor.style.background = 'transparent';
            }
            
            if (editOffsetsBtn) editOffsetsBtn.style.display = 'inline-flex';
            if (saveOffsetsBtn) saveOffsetsBtn.style.display = 'none';
            
            // Update status badge
            let state = 'UNKNOWN';
            try {
              if (msg.status && msg.status.connector && msg.status.connector.state) {
                state = msg.status.connector.state;
              }
            } catch (e) {}
            updateStatusBadge(state);
            
            // Re-enable all buttons
            document.querySelectorAll('button').forEach(btn => setButtonLoading(btn, false));
          }
        });
      });
    })();
    </script>
</body>
</html>`;
  }
}
