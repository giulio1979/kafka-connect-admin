import * as vscode from 'vscode';
import { ConnectionMeta } from '../connectionStore';

export function createConnectionManagerPanel(context: vscode.ExtensionContext, store: any, treeRefresh: () => void) {
  const panel = (vscode as any).window.createWebviewPanel(
    'connectionManager',
    'Connection Manager',
    { viewColumn: (vscode as any).ViewColumn.One, preserveFocus: false },
    { enableScripts: true }
  );

  async function render() {
    const conns: ConnectionMeta[] = await store.listConnections();
    panel.webview.html = `<!doctype html>
    <html>
    <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin: 12px; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
      .header { margin-bottom: 12px; }
      .header h2 { margin: 0 0 8px 0; color: var(--vscode-foreground); }
      .toolbar { display: flex; gap: 6px; margin-bottom: 8px; }
      .btn { padding: 6px 12px; border: 1px solid var(--vscode-button-border); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-radius: 4px; cursor: pointer; font-size: 13px; }
      .btn:hover { background: var(--vscode-button-hoverBackground); }
      .btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); font-weight: 600; }
      .btn.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
      .btn:disabled { opacity: 0.6; cursor: not-allowed; }
      
      .form-container { margin-bottom: 12px; padding: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 6px; background: var(--vscode-editor-background); }
      .form-container.hidden { display: none; }
      .form-container.show { display: block; animation: slideDown 0.2s ease-out; }
      @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      
      .form-title { margin: 0 0 12px 0; color: var(--vscode-foreground); font-size: 16px; font-weight: 600; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
      @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
      
      .form-group { margin-bottom: 8px; }
      .form-group label { display: block; margin-bottom: 3px; font-weight: 600; color: var(--vscode-foreground); font-size: 13px; }
      .form-group input, .form-group select { width: 100%; padding: 6px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-size: 13px; }
      .form-group input:focus, .form-group select:focus { outline: none; border-color: var(--vscode-focusBorder); }
      
      .auth-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
      @media (max-width: 600px) { .auth-fields { grid-template-columns: 1fr; } }
      
      .form-actions { display: flex; gap: 6px; align-items: center; padding-top: 6px; border-top: 1px solid var(--vscode-panel-border); }
      .form-status { margin-left: 8px; font-size: 13px; }
      .form-status.success { color: var(--vscode-testing-iconPassed); }
      .form-status.error { color: var(--vscode-testing-iconFailed); }
      
      .connections-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      .connections-table th, .connections-table td { padding: 8px 6px; border: 1px solid var(--vscode-panel-border); text-align: left; }
      .connections-table th { background: var(--vscode-editor-background); font-weight: 600; color: var(--vscode-foreground); }
      .connections-table tr:nth-child(even) { background: var(--vscode-list-hoverBackground); }
      .connections-table tr:hover { background: var(--vscode-list-activeSelectionBackground); }
      .connections-table .actions { white-space: nowrap; }
      .connections-table .actions .btn { padding: 3px 6px; margin-right: 3px; font-size: 12px; }
      
      .status-bar { margin-top: 12px; padding: 6px 10px; border-radius: 4px; font-size: 13px; }
      .status-bar.success { background: var(--vscode-testing-iconPassed); color: white; }
      .status-bar.error { background: var(--vscode-testing-iconFailed); color: white; }
      .status-bar.info { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
      
      .empty-state { text-align: center; padding: 30px 15px; color: var(--vscode-descriptionForeground); }
      .empty-state h3 { margin: 0 0 6px 0; }
      .empty-state p { margin: 0 0 12px 0; }
    </style>
    </head>
    <body>
      <div class="header">
        <h2>Connection Manager</h2>
        <div class="toolbar">
          <button id="add" class="btn primary">➕ Add Connection</button>
          <button id="refresh" class="btn secondary">🔄 Refresh</button>
          <button id="openSettings" class="btn secondary">⚙️ View Settings</button>
        </div>
      </div>
      
      <div class="info-banner" style="margin-bottom: 12px; padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); border-left: 4px solid var(--vscode-button-background); border-radius: 4px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 16px;">💡</span>
          <div style="font-size: 13px;">
            <strong>Connections and passwords are saved to settings.json!</strong> 
            <span style="color: var(--vscode-descriptionForeground);">You can view and edit them directly in your workspace settings. Passwords are stored as base64.</span>
          </div>
        </div>
      </div>
      
      <div id="formContainer" class="form-container hidden">
        <h3 id="formTitle" class="form-title">Add Connection</h3>
        <form id="connForm">
          <div class="form-grid">
            <div class="form-group">
              <label for="f_name">Connection Name *</label>
              <input id="f_name" name="name" placeholder="e.g., Local Kafka Connect" required/>
            </div>
            <div class="form-group">
              <label for="f_type">Type *</label>
              <select id="f_type" name="type">
                <option value="connect">Kafka Connect</option>
                <option value="schema-registry">Schema Registry</option>
              </select>
            </div>
          </div>
          
          <div class="form-group">
            <label for="f_url">Base URL *</label>
            <input id="f_url" name="url" placeholder="e.g., http://localhost:8083" required/>
          </div>
          
          <div class="form-group">
            <label for="f_auth">Authentication</label>
            <select id="f_auth" name="auth">
              <option value="none">None</option>
              <option value="basic">Basic Auth</option>
              <option value="bearer">Bearer Token</option>
            </select>
          </div>
          
          <div id="authFieldsContainer" class="auth-fields" style="display:none;">
            <div id="basicFields" class="form-group">
              <label for="f_username">Username</label>
              <input id="f_username" name="username" placeholder="Username"/>
            </div>
            <div id="secretField" class="form-group">
              <label for="f_secret">Password / Token</label>
              <input id="f_secret" name="secret" type="password" placeholder="Enter password or bearer token"/>
            </div>
          </div>
          
          <div class="form-actions">
            <button id="saveBtn" type="button" class="btn primary">💾 Save Connection</button>
            <button id="testBtn" type="button" class="btn secondary">🔍 Test Connection</button>
            <button id="cancelBtn" type="button" class="btn">✖️ Cancel</button>
            <span id="formStatus" class="form-status"></span>
          </div>
        </form>
      </div>
      
      ${conns.length === 0 ? `
        <div class="empty-state">
          <h3>No connections configured</h3>
          <p>Get started by adding your first Kafka Connect or Schema Registry connection.</p>
          <button onclick="document.getElementById('add').click()" class="btn primary">➕ Add Your First Connection</button>
        </div>
      ` : `
        <table class="connections-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>URL</th>
              <th>Auth</th>
              <th class="actions">Actions</th>
            </tr>
          </thead>
          <tbody id="rows">
            ${conns.map(c => `
              <tr data-id="${c.id}">
                <td><strong>${c.name}</strong></td>
                <td>${c.type === 'connect' ? '🔌 Kafka Connect' : '📊 Schema Registry'}</td>
                <td><code>${c.url}</code></td>
                <td>${c.authType === 'basic' ? '🔐 Basic' : c.authType === 'bearer' ? '🎫 Bearer' : '🔓 None'}</td>
                <td class="actions">
                  <button class="btn" data-action="edit" data-id="${c.id}" title="Edit connection">✏️</button>
                  <button class="btn" data-action="test" data-id="${c.id}" title="Test connection">🔍</button>
                  <button class="btn" data-action="remove" data-id="${c.id}" title="Remove connection" onclick="return confirm('Remove connection ${c.name}?')">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
      
      <div id="status" class="status-bar" style="display:none;"></div>
      
      <script>
        const vscode = acquireVsCodeApi && acquireVsCodeApi();
        const addBtn = document.getElementById('add');
        const refreshBtn = document.getElementById('refresh');
        const openSettingsBtn = document.getElementById('openSettings');
        const formContainer = document.getElementById('formContainer');
        const formTitle = document.getElementById('formTitle');
        const connForm = document.getElementById('connForm');
        const saveBtn = document.getElementById('saveBtn');
        const testBtn = document.getElementById('testBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const formStatus = document.getElementById('formStatus');
        const authSel = document.getElementById('f_auth');
        const authFieldsContainer = document.getElementById('authFieldsContainer');
        const basicFields = document.getElementById('basicFields');
        const secretField = document.getElementById('secretField');
        
        // Save form state for auto-recovery
        function saveFormState() {
          const state = {
            name: document.getElementById('f_name').value,
            type: document.getElementById('f_type').value,
            url: document.getElementById('f_url').value,
            auth: document.getElementById('f_auth').value,
            username: document.getElementById('f_username').value
          };
          vscode.setState(state);
        }
        
        // Restore form state
        function restoreFormState() {
          const state = vscode.getState();
          if (state) {
            document.getElementById('f_name').value = state.name || '';
            document.getElementById('f_type').value = state.type || 'connect';
            document.getElementById('f_url').value = state.url || '';
            document.getElementById('f_auth').value = state.auth || 'none';
            document.getElementById('f_username').value = state.username || '';
            updateAuthFields();
          }
        }
        
        function updateAuthFields() {
          const authType = authSel.value;
          if (authType === 'basic') { 
            authFieldsContainer.style.display = 'grid';
            basicFields.style.display = 'block';
            secretField.style.display = 'block'; 
            document.getElementById('f_secret').placeholder = 'Enter password';
          } else if (authType === 'bearer') { 
            authFieldsContainer.style.display = 'grid';
            basicFields.style.display = 'none';
            secretField.style.display = 'block'; 
            document.getElementById('f_secret').placeholder = 'Enter bearer token';
          } else { 
            authFieldsContainer.style.display = 'none';
          }
        }

        function showForm(mode, data, secret) {
          formContainer.className = 'form-container show';
          formTitle.textContent = mode === 'edit' ? '✏️ Edit Connection' : '➕ Add New Connection';
          formStatus.textContent = '';
          formStatus.className = 'form-status';
          
          document.getElementById('f_name').value = data && data.name ? data.name : '';
          document.getElementById('f_type').value = data && data.type ? data.type : 'connect';
          document.getElementById('f_url').value = data && data.url ? data.url : '';
          document.getElementById('f_auth').value = data && data.authType ? data.authType : 'none';
          document.getElementById('f_username').value = data && data.username ? data.username : '';
          document.getElementById('f_secret').value = secret || '';
          
          connForm.dataset.mode = mode;
          connForm.dataset.id = data && data.id ? data.id : '';
          
          updateAuthFields();
          
          // Focus first input
          document.getElementById('f_name').focus();
          
          // Clear any stored state when starting fresh
          if (!data) vscode.setState({});
        }

        function hideForm() { 
          formContainer.className = 'form-container hidden';
          connForm.dataset.mode = ''; 
          connForm.dataset.id = ''; 
          vscode.setState({}); // Clear saved state
        }
        
        function showStatus(message, type = 'info') {
          const status = document.getElementById('status');
          status.textContent = message;
          status.className = 'status-bar ' + type;
          status.style.display = 'block';
          setTimeout(() => {
            status.style.display = 'none';
          }, 5000);
        }
        
        function setFormStatus(message, type = 'info') {
          formStatus.textContent = message;
          formStatus.className = 'form-status ' + type;
        }
        
        // Event listeners
        addBtn.addEventListener('click', () => showForm('add', null, null));
        refreshBtn.addEventListener('click', () => { 
          showStatus('Refreshing connections...', 'info');
          vscode.postMessage({ cmd: 'refresh' }); 
        });
        
        openSettingsBtn.addEventListener('click', () => {
          vscode.postMessage({ cmd: 'openSettings' });
        });
        
        // Auto-save form state on input
        ['f_name', 'f_type', 'f_url', 'f_auth', 'f_username'].forEach(id => {
          document.getElementById(id).addEventListener('input', saveFormState);
          document.getElementById(id).addEventListener('change', saveFormState);
        });
        
        document.getElementById('rows')?.addEventListener('click', (e) => {
          const t = e.target || e.srcElement;
          const action = t.getAttribute && t.getAttribute('data-action');
          const id = t.getAttribute && t.getAttribute('data-id');
          if (!action) return;
          
          if (action === 'edit') {
            vscode.postMessage({ cmd: 'get', id });
          } else if (action === 'test') {
            showStatus('Testing connection...', 'info');
            vscode.postMessage({ cmd: action, id });
          } else {
            vscode.postMessage({ cmd: action, id });
          }
        });

        authSel.addEventListener('change', updateAuthFields);

        saveBtn.addEventListener('click', () => {
          const mode = connForm.dataset.mode;
          const id = connForm.dataset.id;
          
          // Validate form
          const name = document.getElementById('f_name').value.trim();
          const url = document.getElementById('f_url').value.trim();
          
          if (!name) {
            setFormStatus('Connection name is required', 'error');
            document.getElementById('f_name').focus();
            return;
          }
          
          if (!url) {
            setFormStatus('Base URL is required', 'error');
            document.getElementById('f_url').focus();
            return;
          }
          
          const meta = {
            id: id || (Date.now() + '-' + Math.random().toString(16).slice(2,8)),
            name: name,
            type: document.getElementById('f_type').value,
            url: url,
            authType: document.getElementById('f_auth').value
          };
          
          if (meta.authType === 'basic') {
            meta.username = document.getElementById('f_username').value || undefined;
          }
          
          const secretVal = document.getElementById('f_secret').value;
          
          saveBtn.disabled = true;
          setFormStatus('Saving connection...', 'info');
          
          vscode.postMessage({ 
            cmd: mode === 'edit' ? 'saveEdit' : 'saveAdd', 
            meta, 
            secret: secretVal 
          });
        });
        
        testBtn.addEventListener('click', () => {
          const url = document.getElementById('f_url').value.trim();
          const type = document.getElementById('f_type').value;
          
          if (!url) {
            setFormStatus('Enter a URL to test', 'error');
            return;
          }
          
          testBtn.disabled = true;
          setFormStatus('Testing connection...', 'info');
          
          // Create a temporary connection for testing
          const testMeta = {
            id: 'temp-test',
            name: 'Test',
            type: type,
            url: url,
            authType: document.getElementById('f_auth').value
          };
          
          if (testMeta.authType === 'basic') {
            testMeta.username = document.getElementById('f_username').value || undefined;
          }
          
          const secretVal = document.getElementById('f_secret').value;
          
          vscode.postMessage({ 
            cmd: 'testForm', 
            meta: testMeta,
            secret: secretVal 
          });
        });

        cancelBtn.addEventListener('click', () => { hideForm(); });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
          if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (formContainer.className.includes('show')) {
              saveBtn.click();
            }
          }
          if (e.key === 'Escape') {
            if (formContainer.className.includes('show')) {
              hideForm();
            }
          }
        });

        window.addEventListener('message', event => {
          const msg = event.data;
          const status = document.getElementById('status');
          
          if (msg.cmd === 'status') { 
            showStatus(msg.message, msg.success ? 'success' : 'error');
          }
          
          if (msg.cmd === 'refresh') { 
            location.reload(); 
          }
          
          if (msg.cmd === 'populate') {
            showForm('edit', msg.meta, msg.secret);
          }
          
          if (msg.cmd === 'saveResult') {
            saveBtn.disabled = false;
            setFormStatus(msg.message, msg.success ? 'success' : 'error');
            
            if (msg.success) {
              setTimeout(() => {
                hideForm();
                vscode.postMessage({ cmd: 'refresh' });
              }, 1000);
            }
          }
          
          if (msg.cmd === 'testResult') {
            testBtn.disabled = false;
            setFormStatus(msg.message, msg.success ? 'success' : 'error');
          }
        });
        
        // Initialize
        restoreFormState();
        
      </script>
    </body>
    </html>`;
  }

  panel.webview.onDidReceiveMessage(async (m: any) => {
    try {
      if (m.cmd === 'saveAdd') {
        const meta = m.meta as ConnectionMeta;
        await store.addConnection(meta);
        if (m.secret) await store.setSecret(meta.id, m.secret);
        panel.webview.postMessage({ cmd: 'saveResult', success: true, message: 'Added' });
        treeRefresh();
      } else if (m.cmd === 'saveEdit') {
        const meta = m.meta as ConnectionMeta;
        const id = meta.id;
        await store.editConnection(id, { name: meta.name, url: meta.url, type: meta.type, authType: meta.authType, username: meta.username }, '');
        if (m.secret) await store.setSecret(id, m.secret);
        panel.webview.postMessage({ cmd: 'saveResult', success: true, message: 'Updated' });
        treeRefresh();
      } else if (m.cmd === 'remove') {
        await store.removeConnection(m.id);
        panel.webview.postMessage({ cmd: 'status', success: true, message: 'Removed' });
        treeRefresh();
        panel.webview.postMessage({ cmd: 'refresh' });
      } else if (m.cmd === 'get') {
        const conns = await store.listConnections();
        const c = conns.find((x:any) => x.id === m.id);
        if (!c) return panel.webview.postMessage({ cmd: 'status', success: false, message: 'Not found' });
        const secret = await store.getSecret(c.id);
        panel.webview.postMessage({ cmd: 'populate', meta: c, secret: secret || '' });
      } else if (m.cmd === 'test') {
        try {
          const conns = await store.listConnections();
          const c = conns.find((x:any) => x.id === m.id);
          if (!c) return panel.webview.postMessage({ cmd: 'status', success: false, message: 'Not found' });
          
          const secret = await store.getSecret(c.id);
          const headers: Record<string,string> = {};
          if (c.authType === 'basic' && c.username && secret) headers['Authorization'] = 'Basic ' + Buffer.from(c.username + ':' + secret).toString('base64');
          else if (c.authType === 'bearer' && secret) headers['Authorization'] = `Bearer ${secret}`;
          
          if (c.type === 'schema-registry') {
            const { SchemaRegistryClient } = await import('../clients/schemaRegistryClient');
            const client = new SchemaRegistryClient({ baseUrl: c.url, headers, name: c.name });
            await client.listSubjects();
            panel.webview.postMessage({ cmd: 'status', success: true, message: `✅ ${c.name} connection successful` });
          } else {
            const { ConnectClient } = await import('../clients/connectClient');
            const client = new ConnectClient({ baseUrl: c.url, headers });
            await client.listConnectors();
            panel.webview.postMessage({ cmd: 'status', success: true, message: `✅ ${c.name} connection successful` });
          }
        } catch (e:any) { panel.webview.postMessage({ cmd: 'status', success: false, message: `❌ Test failed: ${e.message || String(e)}` }); }
      } else if (m.cmd === 'testForm') {
        try {
          const c = m.meta;
          const secret = m.secret;
          const headers: Record<string,string> = {};
          if (c.authType === 'basic' && c.username && secret) headers['Authorization'] = 'Basic ' + Buffer.from(c.username + ':' + secret).toString('base64');
          else if (c.authType === 'bearer' && secret) headers['Authorization'] = `Bearer ${secret}`;
          
          if (c.type === 'schema-registry') {
            const { SchemaRegistryClient } = await import('../clients/schemaRegistryClient');
            const client = new SchemaRegistryClient({ baseUrl: c.url, headers, name: c.name });
            await client.listSubjects();
            panel.webview.postMessage({ cmd: 'testResult', success: true, message: '✅ Connection test successful!' });
          } else {
            const { ConnectClient } = await import('../clients/connectClient');
            const client = new ConnectClient({ baseUrl: c.url, headers });
            await client.listConnectors();
            panel.webview.postMessage({ cmd: 'testResult', success: true, message: '✅ Connection test successful!' });
          }
        } catch (e:any) { panel.webview.postMessage({ cmd: 'testResult', success: false, message: `❌ Test failed: ${e.message || String(e)}` }); }
      } else if (m.cmd === 'refresh') {
        await render(); // Trigger the render function to refresh the webview content
      } else if (m.cmd === 'openSettings') {
        // Open workspace settings focused on our connections setting
        await (vscode as any).commands.executeCommand('workbench.action.openWorkspaceSettings', 'connectAdmin.connections');
      }
    } catch (e:any) { panel.webview.postMessage({ cmd: 'status', success: false, message: e.message || String(e) }); }
  });

  render();
  return panel;
}
