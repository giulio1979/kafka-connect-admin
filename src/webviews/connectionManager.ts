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
    <style>body{font-family:Segoe UI,Arial;margin:12px} table{width:100%;border-collapse:collapse} td,th{padding:8px;border:1px solid #ddd} button{padding:6px 10px;margin-right:6px}</style>
    </head>
    <body>
      <h2>Connection Manager</h2>
      <div style="margin-bottom:12px"><button id="add">Add Connection</button><button id="refresh">Refresh</button></div>
      <div id="formContainer" style="display:none;margin-bottom:12px;padding:12px;border:1px solid #ddd;border-radius:6px;background:#fafafa;">
        <h3 id="formTitle">Add Connection</h3>
        <form id="connForm">
          <div style="margin-bottom:8px;"><label style="display:block;font-weight:600">Name</label><input id="f_name" name="name" style="width:100%;padding:6px" required/></div>
          <div style="margin-bottom:8px;"><label style="display:block;font-weight:600">Type</label><select id="f_type" name="type" style="width:100%;padding:6px"><option value="connect">connect</option><option value="schema-registry">schema-registry</option></select></div>
          <div style="margin-bottom:8px;"><label style="display:block;font-weight:600">Base URL</label><input id="f_url" name="url" style="width:100%;padding:6px" required/></div>
          <div style="margin-bottom:8px;"><label style="display:block;font-weight:600">Auth</label><select id="f_auth" name="auth" style="width:100%;padding:6px"><option value="none">none</option><option value="basic">basic</option><option value="bearer">bearer</option></select></div>
          <div id="basicFields" style="display:none;margin-bottom:8px;"><label style="display:block;font-weight:600">Username</label><input id="f_username" name="username" style="width:100%;padding:6px"/></div>
          <div id="secretField" style="display:none;margin-bottom:8px;"><label style="display:block;font-weight:600">Password / Token</label><input id="f_secret" name="secret" type="password" style="width:100%;padding:6px"/></div>
          <div style="display:flex;gap:8px;align-items:center;"><button id="saveBtn" type="button">Save</button><button id="cancelBtn" type="button">Cancel</button><span id="formStatus" style="margin-left:12px;color:#666"></span></div>
        </form>
      </div>
      <table>
        <thead><tr><th>Name</th><th>Type</th><th>URL</th><th>Auth</th><th>Actions</th></tr></thead>
        <tbody id="rows">
          ${conns.map(c => `<tr data-id="${c.id}"><td>${c.name}</td><td>${c.type}</td><td>${c.url}</td><td>${c.authType||'none'}</td><td><button data-action="edit" data-id="${c.id}">Edit</button><button data-action="remove" data-id="${c.id}">Remove</button><button data-action="test" data-id="${c.id}">Test</button></td></tr>`).join('')}
        </tbody>
      </table>
      <div id="status" style="margin-top:12px;color:#666"></div>
      <script>
  const vscode = acquireVsCodeApi && acquireVsCodeApi();
  const addBtn = document.getElementById('add');
  const refreshBtn = document.getElementById('refresh');
        const formContainer = document.getElementById('formContainer');
        const formTitle = document.getElementById('formTitle');
        const connForm = document.getElementById('connForm');
        const saveBtn = document.getElementById('saveBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const formStatus = document.getElementById('formStatus');
        const authSel = document.getElementById('f_auth');
        const basicFields = document.getElementById('basicFields');
        const secretField = document.getElementById('secretField');

        function showForm(mode, data) {
          formContainer.style.display = '';
          formTitle.textContent = mode === 'edit' ? 'Edit Connection' : 'Add Connection';
          formStatus.textContent = '';
          document.getElementById('f_name').value = data && data.name ? data.name : '';
          document.getElementById('f_type').value = data && data.type ? data.type : 'connect';
          document.getElementById('f_url').value = data && data.url ? data.url : '';
          document.getElementById('f_auth').value = data && data.authType ? data.authType : 'none';
          document.getElementById('f_username').value = data && data.username ? data.username : '';
          document.getElementById('f_secret').value = '';
          connForm.dataset.mode = mode;
          connForm.dataset.id = data && data.id ? data.id : '';
          // adjust fields visibility
          if (document.getElementById('f_auth').value === 'basic') { basicFields.style.display = ''; secretField.style.display = ''; } else if (document.getElementById('f_auth').value === 'bearer') { basicFields.style.display = 'none'; secretField.style.display = ''; } else { basicFields.style.display = 'none'; secretField.style.display = 'none'; }
        }

        function hideForm() { 
          formContainer.style.display = 'none'; 
          connForm.dataset.mode = ''; 
          connForm.dataset.id = ''; 
        }

        addBtn.addEventListener('click', () => showForm('add', null));
        refreshBtn.addEventListener('click', () => { vscode.postMessage({ cmd: 'refresh' }); });
        document.getElementById('rows').addEventListener('click', (e) => {
          const t = e.target || e.srcElement;
          const action = t.getAttribute && t.getAttribute('data-action');
          const id = t.getAttribute && t.getAttribute('data-id');
          if (!action) return;
          if (action === 'edit') {
            // ask extension for connection details
            vscode.postMessage({ cmd: 'get', id });
          } else {
            vscode.postMessage({ cmd: action, id });
          }
        });

        authSel.addEventListener('change', () => {
          if (authSel.value === 'basic') { basicFields.style.display = ''; secretField.style.display = ''; }
          else if (authSel.value === 'bearer') { basicFields.style.display = 'none'; secretField.style.display = ''; }
          else { basicFields.style.display = 'none'; secretField.style.display = 'none'; }
        });

        saveBtn.addEventListener('click', () => {
          const mode = connForm.dataset.mode;
          const id = connForm.dataset.id;
          const meta = {
            id: id || (Date.now() + '-' + Math.random().toString(16).slice(2,8)),
            name: document.getElementById('f_name').value,
            type: document.getElementById('f_type').value,
            url: document.getElementById('f_url').value,
            authType: document.getElementById('f_auth').value
          };
          if (meta.authType === 'basic') meta.username = document.getElementById('f_username').value || undefined;
          const secretVal = document.getElementById('f_secret').value;
          vscode.postMessage({ cmd: mode === 'edit' ? 'saveEdit' : 'saveAdd', meta, secret: secretVal });
          formStatus.textContent = 'Saving...';
        });

        cancelBtn.addEventListener('click', () => { hideForm(); });

        window.addEventListener('message', event => {
          const msg = event.data;
          const status = document.getElementById('status');
          if (msg.cmd === 'status') { status.textContent = msg.message; status.style.color = msg.success ? 'green' : 'red'; }
          if (msg.cmd === 'refresh') { location.reload(); }
          if (msg.cmd === 'populate') { // populate form for edit
            showForm('edit', msg.meta);
          }
          if (msg.cmd === 'saveResult') {
            const fs = document.getElementById('formStatus');
            if (fs) fs.textContent = msg.message;
            if (msg.success) {
              setTimeout(() => {
                hideForm();
                vscode.postMessage({ cmd: 'refresh' }); // Request the extension to refresh the connection list
              }, 800);
            }
          }
        });
        
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
        panel.webview.postMessage({ cmd: 'populate', meta: c });
      } else if (m.cmd === 'test') {
        try {
          const conns = await store.listConnections();
          const c = conns.find((x:any) => x.id === m.id);
          if (!c) return panel.webview.postMessage({ cmd: 'status', success: false, message: 'Not found' });
          if (c.type === 'schema-registry') {
            const { SchemaRegistryClient } = await import('../clients/schemaRegistryClient');
            const client = new SchemaRegistryClient({ baseUrl: c.url, name: c.name });
            await client.listSubjects();
            panel.webview.postMessage({ cmd: 'status', success: true, message: 'Test OK' });
          } else {
            const { ConnectClient } = await import('../clients/connectClient');
            const client = new ConnectClient({ baseUrl: c.url });
            await client.listConnectors();
            panel.webview.postMessage({ cmd: 'status', success: true, message: 'Test OK' });
          }
        } catch (e:any) { panel.webview.postMessage({ cmd: 'status', success: false, message: e.message || String(e) }); }
      } else if (m.cmd === 'refresh') {
        await render(); // Trigger the render function to refresh the webview content
      }
    } catch (e:any) { panel.webview.postMessage({ cmd: 'status', success: false, message: e.message || String(e) }); }
  });

  render();
  return panel;
}
