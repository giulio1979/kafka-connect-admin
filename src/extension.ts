import * as vscode from 'vscode';
import { CredentialManagerIntegration, ConnectionMeta, ConnectionType } from './credentialManagerIntegration';
import { ConnectionsTreeProvider } from './views/connectionsTree';
import { ConnectorView } from './views/connectorView';
import { OffsetEditor } from './views/offsetEditor';
import { SchemaView } from './views/schemaView';
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

export async function activate(context: vscode.ExtensionContext) {
  const credentialManager = new CredentialManagerIntegration(context);
  await credentialManager.initialize();

  const treeProvider = new ConnectionsTreeProvider(context);
  vscode.window.registerTreeDataProvider('connectAdmin.connections', treeProvider);
  const connectorView = new ConnectorView(context);
  const offsetEditor = new OffsetEditor(context);
  const schemaView = new SchemaView(context);

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.hello', () => {
    vscode.window.showInformationMessage('Connect Admin extension activated');
    getOutputChannel().appendLine('[cmd] connectAdmin.hello invoked');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.refreshConnections', () => {
    getOutputChannel().appendLine('[cmd] refreshConnections invoked');
    treeProvider.refresh();
  }));

  // Create simple status bar button for quick access to Credential Manager
  try {
    const addItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
    addItem.command = 'credentialManager.openConnectionManager';
    addItem.text = '$(link) Kafka';
    addItem.tooltip = 'Open Kafka Connection Manager';
    addItem.show();
    context.subscriptions.push(addItem);
    getOutputChannel().appendLine('[status] Created status bar item for Connection Manager');
  } catch (e) {
    getOutputChannel().appendLine(`[status] Failed to create status bar item: ${e}`);
    // Fallback for older VS Code versions
    try {
      const addItem: any = (vscode as any).window.createStatusBarItem((vscode as any).StatusBarAlignment.Left, 1000);
      addItem.command = 'credentialManager.openConnectionManager';
      addItem.text = '$(link) Kafka';
      addItem.tooltip = 'Open Kafka Connection Manager';
      addItem.show();
      context.subscriptions.push(addItem);
      getOutputChannel().appendLine('[status] Created status bar item using fallback method');
    } catch (fallbackError) {
      getOutputChannel().appendLine(`[status] Both methods failed: ${fallbackError}`);
    }
  }

  // Open connector view (node is a serializable payload { meta, name })
  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openConnector', async (node: any) => {
    if (!node || !node.meta || !node.name) return vscode.window.showErrorMessage('Connector node missing');
    const meta = node.meta as any;
    const name = node.name as string;
    const connectorNodePayload = { meta, name };
    // reuse the ConnectorView API which expects a node-like object
    try {
      // use the existing ConnectorView instance to open the connector
      await connectorView.open(connectorNodePayload.meta as any, connectorNodePayload.name as string, credentialManager);
    } catch (e:any) { vscode.window.showErrorMessage(`Failed to open connector: ${e.message || e}`); }
  }));

  // Open schema version view (node is a serializable payload { meta, subject, version })
  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.openSchemaVersion', async (node: any) => {
    if (!node || !node.meta || !node.subject || !node.version) return vscode.window.showErrorMessage('Schema version node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const version = node.version;
    try {
      await schemaView.open(meta, subject, version, credentialManager);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to load schema: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.copySchema', async (node: any) => {
    if (!node || !node.meta || !node.subject) return vscode.window.showErrorMessage('Schema subject node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const headers = await credentialManager.buildAuthHeaders(meta);
    const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
    const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
    try {
      // If node specifies a single version, only copy that version. Otherwise copy all versions of the subject.
      const all: Array<{ version: number; schema: any }> = [];
      if (node.version) {
        const v = node.version;
        try {
          const schema = await client.getSchema(subject, v);
          all.push({ version: v, schema });
        } catch (err:any) {
          getOutputChannel().appendLine(`[copy] failed to fetch ${subject} v${v}: ${err.message || err}`);
        }
      } else {
        // fetch all versions so paste can recreate them
        const versions = await client.getVersions(subject);
        if (!versions || versions.length === 0) return vscode.window.showErrorMessage('No versions found');
        for (const v of versions) {
          try {
            const schema = await client.getSchema(subject, v);
            all.push({ version: v, schema });
          } catch (err:any) {
            getOutputChannel().appendLine(`[copy] failed to fetch ${subject} v${v}: ${err.message || err}`);
          }
        }
      }
      if (all.length === 0) return vscode.window.showErrorMessage('Failed to fetch any versions for subject');
      (global as any).connectAdminSchemaClipboard = { subject, versions: all };
      const latest = all[all.length - 1].version;
      vscode.window.showInformationMessage(`Copied schema ${subject} (${all.length} versions, latest v${latest})`);
    } catch (e:any) { vscode.window.showErrorMessage(`Failed to copy schema: ${e.message || e}`); }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.copySchemaVersion', async (node: any) => {
    if (!node || !node.meta || !node.subject || !node.version) return vscode.window.showErrorMessage('Schema version node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const version = node.version;
    const headers = await credentialManager.buildAuthHeaders(meta);
    const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
    const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
    try {
      const schema = await client.getSchema(subject, version);
      (global as any).connectAdminSchemaClipboard = { subject, versions: [{ version, schema }] };
      vscode.window.showInformationMessage(`Copied schema ${subject} v${version}`);
    } catch (e:any) { vscode.window.showErrorMessage(`Failed to copy schema version: ${e.message || e}`); }
  }));

  // Delete commands
  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.deleteSchemaSubject', async (node: any) => {
    if (!node || !node.meta || !node.subject) return vscode.window.showErrorMessage('Schema subject node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    
    const confirmed = await vscode.window.showWarningMessage(
      `Delete subject "${subject}" and all its versions? This action cannot be undone.`,
      { modal: true },
      'Delete Subject'
    );
    if (confirmed !== 'Delete Subject') return;

    const headers = await credentialManager.buildAuthHeaders(meta);
    
    try {
      const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
      const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
      await client.deleteSubject(subject);
      vscode.window.showInformationMessage(`Deleted subject ${subject}`);
      treeProvider.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to delete subject: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.deleteSchemaVersion', async (node: any) => {
    if (!node || !node.meta || !node.subject || !node.version) return vscode.window.showErrorMessage('Schema version node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const version = node.version;
    
    const confirmed = await vscode.window.showWarningMessage(
      `Delete version ${version} of subject "${subject}"? This action cannot be undone.`,
      { modal: true },
      'Delete Version'
    );
    if (confirmed !== 'Delete Version') return;

    const headers = await credentialManager.buildAuthHeaders(meta);
    
    try {
      const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
      const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
      await client.deleteSchemaVersion(subject, version);
      vscode.window.showInformationMessage(`Deleted ${subject} v${version}`);
      treeProvider.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to delete schema version: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.deleteConnector', async (node: any) => {
    if (!node || !node.meta || !node.name) return vscode.window.showErrorMessage('Connector node missing');
    const meta = node.meta as any;
    const connectorName = node.name as string;
    
    const confirmed = await vscode.window.showWarningMessage(
      `Delete connector "${connectorName}"? This action cannot be undone.`,
      { modal: true },
      'Delete Connector'
    );
    if (confirmed !== 'Delete Connector') return;

    const headers = await credentialManager.buildAuthHeaders(meta);
    
    try {
      const { ConnectClient } = await import('./clients/connectClient');
      const client = new ConnectClient({ baseUrl: meta.url, headers });
      await client.deleteConnector(connectorName);
      vscode.window.showInformationMessage(`Deleted connector ${connectorName}`);
      treeProvider.refresh();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to delete connector: ${e.message || e}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.pause', async (node?: any) => {
    if (!node || !node.meta || !node.name) return vscode.window.showErrorMessage('Connector missing');
    const meta = node.meta as any;
    const name = node.name as string;
    try { 
      await connectorView.open(meta, name, credentialManager); 
    } catch (e:any) { 
      vscode.window.showErrorMessage(`Open connector failed: ${e.message||e}`); 
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.resume', async (node?: any) => {
    if (!node || !node.meta || !node.name) return vscode.window.showErrorMessage('Connector missing');
    const meta = node.meta as any;
    const name = node.name as string;
    try { 
      await connectorView.open(meta, name, credentialManager); 
    } catch (e:any) { 
      vscode.window.showErrorMessage(`Open connector failed: ${e.message||e}`); 
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.connector.showOffsets', async (node?: any) => {
    if (!node || !node.meta || !node.name) return vscode.window.showErrorMessage('Connector missing');
    const meta = node.meta as any;
    const name = node.name as string;
    try { 
      await connectorView.open(meta, name, credentialManager); 
    } catch (e:any) { 
      vscode.window.showErrorMessage(`Open connector failed: ${e.message||e}`); 
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.pasteSchema', async (node: any) => {
    if (!node || !node.meta || !node.subject) return vscode.window.showErrorMessage('Schema subject node missing');
    const meta = node.meta as any;
    const subject = node.subject as string;
    const target = subject;
    const clipboard = (global as any).connectAdminSchemaClipboard;
    if (!clipboard) return vscode.window.showErrorMessage('No schema copied');
    
    const headers = await credentialManager.buildAuthHeaders(meta);
    const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
    const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
    
    // Support multi-version clipboard payloads (replay all versions in order)
    if (clipboard.versions && Array.isArray(clipboard.versions)) {
      let diagSchemaStr: string | undefined = undefined;
      try {
        for (const v of clipboard.versions) {
          const payloadSchema = v.schema;
          let schemaStr = extractSchemaString(payloadSchema ?? payloadSchema);
          let schemaType: string | undefined = (payloadSchema && (payloadSchema as any).schemaType) || (payloadSchema && (payloadSchema as any).type) || undefined;
          if (!schemaStr) {
            getOutputChannel().appendLine(`[paste] skipping version ${v.version} for ${target}: schema payload not understood`);
            continue;
          }
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
              if (regRes && typeof regRes.id === 'number') {
                try {
                  const byId = await client.getSchemaById(regRes.id);
                  getOutputChannel().appendLine(`[paste] fetched by id ${regRes.id}: ${JSON.stringify(byId).slice(0,1000)}`);
                } catch (byIdErr:any) {
                  getOutputChannel().appendLine(`[paste] getSchemaById ${regRes.id} failed: ${byIdErr && byIdErr.message ? byIdErr.message : String(byIdErr)}`);
                  throw new Error(`Registry returned id ${regRes.id} but /schemas/ids/${regRes.id} is not available`);
                }
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
      return;
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

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.pasteSchemaVersion', async (node: any) => {
    // Alias to pasteSchema for single version pastes
    await vscode.commands.executeCommand('connectAdmin.pasteSchema', node);
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
    
    const headers = await credentialManager.buildAuthHeaders(meta);
    const { SchemaRegistryClient } = await import('./clients/schemaRegistryClient');
    const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
    
    // Support multi-version clipboard payloads (replay) similar to paste on subject
    if (clipboard.versions && Array.isArray(clipboard.versions)) {
      let diagSchemaStr: string | undefined = undefined;
      try {
        for (const v of clipboard.versions) {
          const payloadSchema = v.schema;
          let schemaStr = extractSchemaString(payloadSchema ?? payloadSchema);
          let schemaType: string | undefined = (payloadSchema && (payloadSchema as any).schemaType) || (payloadSchema && (payloadSchema as any).type) || undefined;
          if (!schemaStr) {
            getOutputChannel().appendLine(`[paste] skipping version ${v.version} for ${target}: schema payload not understood`);
            continue;
          }
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
              if (regRes && typeof regRes.id === 'number') {
                try {
                  const byId = await client.getSchemaById(regRes.id);
                  getOutputChannel().appendLine(`[paste] fetched by id ${regRes.id}: ${JSON.stringify(byId).slice(0,1000)}`);
                } catch (byIdErr:any) {
                  getOutputChannel().appendLine(`[paste] getSchemaById ${regRes.id} failed: ${byIdErr && byIdErr.message ? byIdErr.message : String(byIdErr)}`);
                  throw new Error(`Registry returned id ${regRes.id} but /schemas/ids/${regRes.id} is not available`);
                }
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
        }
        try {
          const tv = await client.getVersions(target);
          getOutputChannel().appendLine(`[verify] target versions for ${target}: ${JSON.stringify(tv)}`);
          vscode.window.showInformationMessage(`Pasted schema to ${target} (versions: ${tv ? tv.length : 0})`);
          treeProvider.refresh();
        } catch (ve:any) {
          getOutputChannel().appendLine(`[verify] failed to fetch target versions: ${ve.message || ve}`);
          vscode.window.showInformationMessage(`Pasted schema to ${target}`);
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
      return;
    }

    // single-schema fallback continues below
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

  context.subscriptions.push(vscode.commands.registerCommand('connectAdmin.testOfficialClient', async (node: any) => {
    if (!node || !node.meta) return vscode.window.showErrorMessage('Schema registry connection missing');
    const meta = node.meta as any;
    if (meta.type !== 'schema-registry') return vscode.window.showErrorMessage('Connection is not a schema registry');
    const headers = await credentialManager.buildAuthHeaders(meta);
    try {
      // Convert headers to auth string for OfficialSchemaRegistryClient
      let authString = '';
      if (headers['Authorization']) {
        authString = headers['Authorization'];
      }
      const official = new OfficialSchemaRegistryClient(meta.url, authString);
      const subjects = await official.listSubjects();
      vscode.window.showInformationMessage(`Official client test successful! Found ${subjects.length} subjects.`);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Official client test failed: ${e.message || e}`);
    }
  }));
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
