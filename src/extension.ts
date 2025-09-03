import * as vscode from 'vscode';
import { ConnectionStore, ConnectionMeta, ConnectionType } from './connectionStore';
import { ConnectionsTreeProvider } from './views/connectionsTree';
import { ConnectorView } from './views/connectorView';
import { OffsetEditor } from './views/offsetEditor';
import { getOutputChannel } from './logger';
import { OfficialSchemaRegistryClient } from './clients/officialSchemaRegistryClient';

// Try to extract a schema string from several possible payload shapes.
function extractSchemaString(payload: any): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    if (typeof payload.schema === 'string') return payload.schema;
    if (typeof payload.schemaString === 'string') return payload.schemaString;
    // some registries return { schema: { schema: '...' } }
    if (payload.schema && typeof payload.schema === 'object' && typeof payload.schema.schema === 'string') return payload.schema.schema;
    // common alternate keys
    if (typeof (payload as any).definition === 'string') return (payload as any).definition;
    if (typeof (payload as any).value === 'string') return (payload as any).value;
    // recursively search one level deep for a schema string
    for (const k of Object.keys(payload)) {
      const v = (payload as any)[k];
      if (v && typeof v === 'object') {
        const s = extractSchemaString(v);
        if (s) return s;
      }
    }
  }
  return undefined;
}

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
  addItem.command = 'connectAdmin.openConnectionManager';
  addItem.text = '$(organization) Connections';
  addItem.tooltip = 'Open Connection Manager';
  addItem.show();
  context.subscriptions.push(addItem);
  } catch (e) {
    // ignore if StatusBar API isn't present in the shim
  }

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.addConnection', async () => {
  getOutputChannel().appendLine('[cmd] addConnection invoked - opening Connection Manager');
  const { createConnectionManagerPanel } = await import('./webviews/connectionManager');
  createConnectionManagerPanel(context, store, () => treeProvider.refresh());
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

  // Open connector view (node is a serializable payload { meta, name })
  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openConnector', async (node: any) => {
    if (!node || !node.meta || !node.name) return vscode.window.showErrorMessage('Connector node missing');
    const meta = node.meta as any;
    const name = node.name as string;
    const connectorNodePayload = { meta, name };
    // reuse the ConnectorView API which expects a node-like object
    try {
      // use the existing ConnectorView instance to open the connector
      await connectorView.open(connectorNodePayload.meta as any, connectorNodePayload.name as string);
    } catch (e:any) { vscode.window.showErrorMessage(`Failed to open connector: ${e.message || e}`); }
  }));

  // Open schema version view (node is a serializable payload { meta, subject, version })
  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openSchemaVersion', async (node: any) => {
    if (!node || !node.meta || !node.subject || !node.version) return vscode.window.showErrorMessage('Schema version node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const version = node.version;
    try {
      const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
      const client = new SchemaRegistryClient({ baseUrl: meta.url, name: meta.name });
      const schema = await client.getSchema(subject, version);
      // Show schema in a webview
      const panel = (vscode as any).window.createWebviewPanel(
        'schemaVersionView',
        `Schema: ${subject} v${version}`,
        { viewColumn: (vscode as any).ViewColumn.Active, preserveFocus: false },
        { enableScripts: true }
      );
      panel.webview.html = `<html><body><h2>${subject} v${version}</h2><pre style='white-space:pre-wrap;font-family:monospace;background:#f6f8fa;padding:12px;border-radius:4px;'>${JSON.stringify(schema, null, 2).replace(/</g,'&lt;')}</pre></body></html>`;
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to load schema: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.copySchema', async (node: any) => {
    if (!node || !node.meta || !node.subject) return vscode.window.showErrorMessage('Schema subject node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const secret = await store.getSecret(meta.id);
    const headers: Record<string,string> = {};
    if (meta.authType === 'basic' && meta.username && secret) headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
    else if (meta.authType === 'bearer' && secret) headers['Authorization'] = `Bearer ${secret}`;
  const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
  const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
    try {
      // fetch all versions so paste can recreate them
      const versions = await client.getVersions(subject);
      if (!versions || versions.length === 0) return vscode.window.showErrorMessage('No versions found');
      const all: Array<{ version: number; schema: any }> = [];
      for (const v of versions) {
        try {
          const schema = await client.getSchema(subject, v);
          all.push({ version: v, schema });
        } catch (err:any) {
          getOutputChannel().appendLine(`[copy] failed to fetch ${subject} v${v}: ${err.message || err}`);
        }
      }
      if (all.length === 0) return vscode.window.showErrorMessage('Failed to fetch any versions for subject');
      (global as any).connectAdminSchemaClipboard = { subject, versions: all };
      const latest = all[all.length - 1].version;
      vscode.window.showInformationMessage(`Copied schema ${subject} (${all.length} versions, latest v${latest})`);
    } catch (e:any) { vscode.window.showErrorMessage(`Failed to copy schema: ${e.message || e}`); }
  }));

  context.subscriptions.push(store);

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openConnectionManager', async () => {
    const { createConnectionManagerPanel } = await import('./webviews/connectionManager');
    createConnectionManagerPanel(context, store, () => treeProvider.refresh());
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.editConnection', async (node?: any) => {
    // attempt to open edit flow via connection manager
    getOutputChannel().appendLine('[cmd] editConnection invoked');
    let meta: any;
    if (node && node.meta) meta = node.meta;
    if (!meta) {
      const conns = await store.listConnections();
      const pick = await vscode.window.showQuickPick(conns.map(c => ({ label: c.name, id: c.id } as any)), { placeHolder: 'Select connection to edit' });
      if (!pick) return;
      meta = conns.find(c => c.id === pick.id);
    }
    if (!meta) return vscode.window.showErrorMessage('Connection not found');
    const { createConnectionManagerPanel } = await import('./webviews/connectionManager');
    const panel = createConnectionManagerPanel(context, store, () => treeProvider.refresh());
    // ask the webview to populate the form
    setTimeout(() => panel.webview.postMessage({ cmd: 'populate', meta }), 300);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openEditConnection', async (node?: any) => {
    // alias to editConnection
    await vscode.commands.executeCommand('connectAdmin.editConnection', node);
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.testConnection', async (node?: any) => {
    if (!node || !node.meta) return vscode.window.showErrorMessage('Connection missing');
    const meta = node.meta as any;
    try {
      if (meta.type === 'schema-registry') {
        const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
        const client = new SchemaRegistryClient({ baseUrl: meta.url });
        await client.listSubjects();
      } else {
        const { ConnectClient } = await import('./clients/connectClient');
        const client = new ConnectClient({ baseUrl: meta.url });
        await client.listConnectors();
      }
      vscode.window.showInformationMessage('Test OK');
    } catch (e:any) { vscode.window.showErrorMessage(`Test failed: ${e.message || e}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.pause', async (node?: any) => {
    if (!node) return vscode.window.showErrorMessage('Connector node missing');
    const meta = node.meta as any; const name = node.name as string;
    const { ConnectClient } = await import('./clients/connectClient');
    const client = new ConnectClient({ baseUrl: meta.url });
    try { await client.pauseConnector(name); vscode.window.showInformationMessage(`Paused ${name}`); } catch (e:any) { vscode.window.showErrorMessage(`Pause failed: ${e.message||e}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.resume', async (node?: any) => {
    if (!node) return vscode.window.showErrorMessage('Connector node missing');
    const meta = node.meta as any; const name = node.name as string;
    const { ConnectClient } = await import('./clients/connectClient');
    const client = new ConnectClient({ baseUrl: meta.url });
    try { await client.resumeConnector(name); vscode.window.showInformationMessage(`Resumed ${name}`); } catch (e:any) { vscode.window.showErrorMessage(`Resume failed: ${e.message||e}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.showOffsets', async (node?: any) => {
    if (!node) return vscode.window.showErrorMessage('Connector node missing');
    const meta = node.meta as any; const name = node.name as string;
    try { await connectorView.open(meta, name); } catch (e:any) { vscode.window.showErrorMessage(`Open connector failed: ${e.message||e}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.pasteSchema', async (node: any) => {
    if (!node || !node.meta || !node.subject) return vscode.window.showErrorMessage('Target subject node missing');
    const meta = node.meta as any;
    const defaultSubject = node.subject as string;
    const clipboard = (global as any).connectAdminSchemaClipboard;
    if (!clipboard) return vscode.window.showErrorMessage('No schema copied');
    const target = await vscode.window.showInputBox({ prompt: 'Target subject name', value: defaultSubject });
    if (!target) return;
    const secret = await store.getSecret(meta.id);
    const headers: Record<string,string> = {};
    if (meta.authType === 'basic' && meta.username && secret) headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
    else if (meta.authType === 'bearer' && secret) headers['Authorization'] = `Bearer ${secret}`;
    const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
    const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
  // If clipboard contains multiple versions, attempt to register them in ascending order
  let diagSchemaStr: string | undefined = undefined;
  if (clipboard.versions && Array.isArray(clipboard.versions)) {
      try {
  let diagSchemaStr: string | undefined = undefined;
  for (const v of clipboard.versions) {
          // try to extract schema string and type from clipboard
          const payloadSchema = v.schema;
          let schemaStr = extractSchemaString(payloadSchema ?? payloadSchema);
          let schemaType: string | undefined = (payloadSchema && (payloadSchema as any).schemaType) || (payloadSchema && (payloadSchema as any).type) || undefined;
          if (!schemaStr) {
            getOutputChannel().appendLine(`[paste] skipping version ${v.version} for ${target}: schema payload not understood`);
            continue;
          }
          // ensure schema is a string
          if (typeof schemaStr !== 'string') schemaStr = JSON.stringify(schemaStr);
          if (!diagSchemaStr) diagSchemaStr = schemaStr;
          let registered = false;
          for (let attempt = 1; attempt <= 3 && !registered; attempt++) {
            try {
              const payload: any = { schema: schemaStr };
              if (schemaType) payload.schemaType = schemaType;
              const regRes: any = await client.registerSchema(target, payload);
              registered = true;
              getOutputChannel().appendLine(`[paste] registered ${target} v${v.version} (attempt ${attempt}) -> id=${regRes && regRes.id ? regRes.id : 'unknown'}`);
              // if registry returned a global id, try fetching the schema by id to confirm it's stored
              if (regRes && typeof regRes.id === 'number') {
                // immediately verify the registry stored the schema globally
                try {
                  const byId = await client.getSchemaById(regRes.id);
                  getOutputChannel().appendLine(`[paste] fetched by id ${regRes.id}: ${JSON.stringify(byId).slice(0,1000)}`);
                } catch (byIdErr:any) {
                  getOutputChannel().appendLine(`[paste] getSchemaById ${regRes.id} failed: ${byIdErr && byIdErr.message ? byIdErr.message : String(byIdErr)}`);
                  // treat as failure: registry returned id but cannot return schema by id
                  throw new Error(`Registry returned id ${regRes.id} but /schemas/ids/${regRes.id} is not available`);
                }
              }
            } catch (ve:any) {
              vscode.window.showWarningMessage(`Schema registered but verification for ${target} failed`);
              // diagnostic: attempt to locate schema under any subject
              try {
                if (diagSchemaStr) {
                  const diag = await findSubjectBySchema(client, diagSchemaStr);
                  if (diag && diag.subject) {
                    getOutputChannel().appendLine(`[diag] schema appears under subject='${diag.subject}' v${diag.version}`);
                    vscode.window.showWarningMessage(`Schema may exist under subject ${diag.subject} v${diag.version}`);
                  }
                }
              } catch (dErr:any) {
                getOutputChannel().appendLine(`[diag] findSubjectBySchema failed: ${dErr && dErr.message ? dErr.message : String(dErr)}`);
              }
              treeProvider.refresh();
            }
          }
        }
        // verify by fetching versions
          try {
            const tv = await client.getVersions(target);
            getOutputChannel().appendLine(`[verify] target versions for ${target}: ${JSON.stringify(tv)}`);
            vscode.window.showInformationMessage(`Pasted schema to ${target} (versions: ${tv ? tv.length : 0})`);
            treeProvider.refresh();
          } catch (ve:any) {
            getOutputChannel().appendLine(`[verify] failed to fetch target versions: ${ve.message || ve}`);
            vscode.window.showInformationMessage(`Pasted schema to ${target}`);
            // diagnostic: attempt to locate schema under any subject
            try {
              if (diagSchemaStr) {
                const diag = await findSubjectBySchema(client, diagSchemaStr);
                if (diag && diag.subject) {
                  getOutputChannel().appendLine(`[diag] schema appears under subject='${diag.subject}' v${diag.version}`);
                  vscode.window.showWarningMessage(`Schema may exist under subject ${diag.subject} v${diag.version}`);
                }
              }
            } catch (dErr:any) {
              getOutputChannel().appendLine(`[diag] findSubjectBySchema failed: ${dErr && dErr.message ? dErr.message : String(dErr)}`);
            }
            treeProvider.refresh();
          }
        } catch (ve:any) {
          vscode.window.showWarningMessage(`Schema registered but verification for ${target} failed`);
          try {
            if (diagSchemaStr) {
              const diag = await findSubjectBySchema(client, diagSchemaStr);
              if (diag && diag.subject) {
                getOutputChannel().appendLine(`[diag] schema appears under subject='${diag.subject}' v${diag.version}`);
                vscode.window.showWarningMessage(`Schema may exist under subject ${diag.subject} v${diag.version}`);
              }
            }
          } catch (dErr:any) {
            getOutputChannel().appendLine(`[diag] findSubjectBySchema failed: ${dErr && dErr.message ? dErr.message : String(dErr)}`);
          }
          treeProvider.refresh();
        }
    }
    // fallback: single-schema payloads
    let schemaStr = extractSchemaString(clipboard.schema ?? clipboard);
    let schemaType: string | undefined = (clipboard.schema && (clipboard.schema as any).schemaType) || (clipboard.schema && (clipboard.schema as any).type) || undefined;
    if (!schemaStr) return vscode.window.showErrorMessage('Copied schema payload not understood');
    if (typeof schemaStr !== 'string') schemaStr = JSON.stringify(schemaStr);
    try {
      const payload: any = { schema: schemaStr };
      if (schemaType) payload.schemaType = schemaType;
      await client.registerSchema(target, payload);
      // verify with a few retries
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const tv = await client.getVersions(target);
          if (tv && tv.length > 0) {
            getOutputChannel().appendLine(`[verify] target versions for ${target}: ${JSON.stringify(tv)}`);
            vscode.window.showInformationMessage(`Pasted schema to ${target} (versions: ${tv.length})`);
            treeProvider.refresh();
            return;
          }
        } catch (ve:any) {
          getOutputChannel().appendLine(`[verify] attempt ${attempt} failed: ${ve.message || ve}`);
        }
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
      vscode.window.showWarningMessage(`Schema registered but target reports no versions for ${target}`);
      treeProvider.refresh();
    } catch (e:any) { vscode.window.showErrorMessage(`Failed to paste schema: ${e.message || e}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.pasteSchemaToConnection', async (node: any) => {
    if (!node || !node.meta) return vscode.window.showErrorMessage('Target connection missing');
    const meta = node.meta as any;
    if (meta.type !== 'schema-registry') return vscode.window.showErrorMessage('Target connection is not a schema registry');
    const clipboard = (global as any).connectAdminSchemaClipboard;
    if (!clipboard) return vscode.window.showErrorMessage('No schema copied');
    const defaultName = clipboard.subject || '';
    const target = await vscode.window.showInputBox({ prompt: 'Target subject name', value: defaultName });
    if (!target) return;
    const secret = await store.getSecret(meta.id);
    const headers: Record<string,string> = {};
    if (meta.authType === 'basic' && meta.username && secret) headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
    else if (meta.authType === 'bearer' && secret) headers['Authorization'] = `Bearer ${secret}`;
  const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
  const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
  let schemaStr = extractSchemaString(clipboard.schema ?? clipboard);
    let schemaType: string | undefined = (clipboard.schema && (clipboard.schema as any).schemaType) || (clipboard.schema && (clipboard.schema as any).type) || undefined;
    if (!schemaStr) return vscode.window.showErrorMessage('Copied schema payload not understood');
    if (typeof schemaStr !== 'string') schemaStr = JSON.stringify(schemaStr);
      try {
        const payload: any = { schema: schemaStr };
        if (schemaType) payload.schemaType = schemaType;
        const regRes: any = await client.registerSchema(target, payload);
        getOutputChannel().appendLine(`[paste] single-register returned id=${regRes && regRes.id ? regRes.id : 'unknown'}`);
        if (regRes && typeof regRes.id === 'number') {
          try {
            const byId = await client.getSchemaById(regRes.id);
            getOutputChannel().appendLine(`[paste] fetched by id ${regRes.id}: ${JSON.stringify(byId).slice(0,1000)}`);
          } catch (byIdErr:any) {
            getOutputChannel().appendLine(`[paste] getSchemaById ${regRes.id} failed: ${byIdErr && byIdErr.message ? byIdErr.message : String(byIdErr)}`);
            throw new Error(`Registry returned id ${regRes.id} but /schemas/ids/${regRes.id} is not available`);
          }
        }
        // authoritative verification
        try {
          const verifyResult = await verifySubjectRegistered(client, target);
          if (verifyResult.ok) {
            const verCount = Array.isArray((verifyResult as any).versions)
              ? (verifyResult as any).versions.length
              : (Array.isArray((verifyResult as any).subjects) ? (verifyResult as any).subjects.length : 0);
            vscode.window.showInformationMessage(`Pasted schema to ${target} (versions: ${verCount})`);
            treeProvider.refresh();
          } else {
            vscode.window.showWarningMessage(`Schema registered but verification for ${target} failed`);
            treeProvider.refresh();
          }
        } catch (ve:any) {
          vscode.window.showWarningMessage(`Schema registered but verification attempt for ${target} failed: ${ve.message || ve}`);
          treeProvider.refresh();
        }
      } catch (e:any) {
        vscode.window.showErrorMessage(`Failed to paste schema: ${e.message || e}`);
      }
  }));
}

async function verifySubjectRegistered(client: any, subject: string, expectedMinVersions = 1, attempts = 6, initialDelayMs = 200) {
  const oc = getOutputChannel();
  oc.appendLine(`[verify] Verifying subject='${subject}' on ${client.baseUrl} (expect >= ${expectedMinVersions} versions) started`);

  let delay = initialDelayMs;
  for (let i = 0; i < attempts; i++) {
    try {
      // Prefer the authoritative endpoint /subjects/{subject}/versions
      const versions = await client.getVersions(subject);
      if (Array.isArray(versions) && versions.length >= expectedMinVersions) {
        oc.appendLine(`[verify] getVersions success for '${subject}' versions=${versions.length}`);
        return { ok: true, method: 'getVersions', versions };
      }
      oc.appendLine(`[verify] getVersions returned ${Array.isArray(versions) ? versions.length : typeof versions} (attempt ${i+1}/${attempts})`);
    } catch (err) {
      oc.appendLine(`[verify] getVersions error for '${subject}' (attempt ${i+1}/${attempts}): ${String(err)}`);
    }

    // Fallback: check whether the subject shows up in listSubjects
    try {
      const subjects = await client.listSubjects();
      if (Array.isArray(subjects) && subjects.includes(subject)) {
        oc.appendLine(`[verify] listSubjects contains '${subject}' (attempt ${i+1}/${attempts})`);
        return { ok: true, method: 'listSubjects', subjects };
      }
      oc.appendLine(`[verify] listSubjects does not contain '${subject}' (count=${Array.isArray(subjects)?subjects.length:'?'}). attempt ${i+1}/${attempts}`);
    } catch (err) {
      oc.appendLine(`[verify] listSubjects error for '${subject}' (attempt ${i+1}/${attempts}): ${String(err)}`);
    }

    // Wait and retry
    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(2000, delay * 2);
  }

  oc.appendLine(`[verify] Verification failed for '${subject}' after ${attempts} attempts`);
  return { ok: false };
}

// Diagnostic helper: search all subjects to find one whose any-version schema equals the provided schema string
async function findSubjectBySchema(client: any, schemaStr: string, maxSubjects = 100) {
  const oc = getOutputChannel();
  try {
    const subjects = await client.listSubjects();
    oc.appendLine(`[diag] listSubjects returned ${subjects.length} subjects`);
    let checked = 0;
    for (const s of subjects) {
      if (checked++ >= maxSubjects) break;
      try {
        const versions = await client.getVersions(s);
        for (const v of versions) {
          try {
            const sch = await client.getSchema(s, v);
            const extracted = typeof sch === 'string' ? sch : extractSchemaString(sch) || JSON.stringify(sch);
            if (extracted === schemaStr) {
              oc.appendLine(`[diag] Found matching schema under subject='${s}' version=${v}`);
              return { subject: s, version: v };
            }
          } catch (e:any) {
            // ignore per-version errors
          }
        }
      } catch (e:any) {
        // ignore subject-level errors
      }
    }
    oc.appendLine('[diag] No matching subject found for provided schema');
    return null;
  } catch (e:any) {
    oc.appendLine(`[diag] findSubjectBySchema failed: ${e && e.message ? e.message : String(e)}`);
    return null;
  }
}

export function deactivate() {
  // nothing to clean up yet
}