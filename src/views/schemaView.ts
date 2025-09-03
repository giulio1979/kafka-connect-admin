import * as vscode from 'vscode';
import { SchemaRegistryClient } from '../clients/schemaRegistryClient';
import { getOutputChannel } from '../logger';

export class SchemaView {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  async open(meta: any, subject: string, version: number, store: any) {
    try {
      const secret = await store.getSecret(meta.id);
      const headers: Record<string, string> = {};
      if (meta.authType === 'basic' && meta.username && secret) {
        headers['Authorization'] = 'Basic ' + Buffer.from(meta.username + ':' + secret).toString('base64');
      } else if (meta.authType === 'bearer' && secret) {
        headers['Authorization'] = `Bearer ${secret}`;
      }

      const client = new SchemaRegistryClient({ baseUrl: meta.url, headers, name: meta.name });
      const schema = await client.getSchema(subject, version);

      const panel = (vscode as any).window.createWebviewPanel(
        'schemaVersionView',
        `Schema: ${subject} v${version}`,
        { viewColumn: (vscode as any).ViewColumn.Active, preserveFocus: false },
        { enableScripts: true, retainContextWhenHidden: true }
      );

      await this.render(panel, schema, meta, subject, version, client);
      this.setupMessageHandlers(panel, schema, meta, subject, version, client, store);

    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to load schema: ${e.message || e}`);
    }
  }

  private async render(panel: any, schema: any, meta: any, subject: string, version: number, client: SchemaRegistryClient) {
    // Parse the schema string if it's embedded
    let parsedSchema: any = null;
    let schemaString = '';
    let schemaType = schema.schemaType || 'AVRO';
    
    if (typeof schema.schema === 'string') {
      schemaString = schema.schema;
      try {
        parsedSchema = JSON.parse(schema.schema);
      } catch (e) {
        // If it's not JSON, treat as plain text (e.g., PROTOBUF)
        parsedSchema = null;
      }
    } else if (schema.schema) {
      parsedSchema = schema.schema;
      schemaString = JSON.stringify(schema.schema, null, 2);
    }

    // Get compatibility level
    let compatibility = 'UNKNOWN';
    try {
      compatibility = await client.getCompatibility(subject);
    } catch (e) {
      // Ignore compatibility fetch errors
    }

    panel.webview.html = this.getWebviewContent(schema, parsedSchema, schemaString, schemaType, compatibility, subject, version, meta);
  }

  private getWebviewContent(schema: any, parsedSchema: any, schemaString: string, schemaType: string, compatibility: string, subject: string, version: number, meta: any): string {
    const isJsonSchema = parsedSchema !== null;
    const isReadonly = false; // We'll make this configurable later

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Schema: ${subject} v${version}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .title {
            font-size: 1.5em;
            font-weight: 600;
            margin: 0;
        }
        .actions {
            display: flex;
            gap: 8px;
        }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
        }
        .btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .section {
            margin-bottom: 24px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
        }
        .section h3 {
            margin: 0 0 12px 0;
            font-size: 1.1em;
            color: var(--vscode-foreground);
        }
        .form-row {
            display: flex;
            margin-bottom: 12px;
            align-items: center;
        }
        .form-row label {
            flex: 0 0 120px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        .form-row input, .form-row select, .form-row textarea {
            flex: 1;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 6px 8px;
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }
        .form-row input:focus, .form-row select:focus, .form-row textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .form-row input:read-only {
            background: var(--vscode-input-background);
            opacity: 0.6;
        }
        .schema-editor {
            font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
            font-size: var(--vscode-editor-font-size, 14px);
            min-height: 300px;
            resize: vertical;
            white-space: pre;
            line-height: 1.4;
        }
        .error {
            color: var(--vscode-errorForeground);
            font-size: 0.9em;
            margin-top: 4px;
        }
        .success {
            color: var(--vscode-notificationsInfoIcon-foreground);
            font-size: 0.9em;
            margin-top: 4px;
        }
        .json-fields {
            display: ${isJsonSchema ? 'block' : 'none'};
        }
        .field-row {
            display: flex;
            margin-bottom: 8px;
            padding: 8px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
        }
        .field-row input {
            margin-right: 8px;
        }
        .add-field {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }
        .remove-field {
            background: transparent;
            color: var(--vscode-errorForeground);
            border: none;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 3px;
        }
        .tabs {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 16px;
        }
        .tab {
            padding: 8px 16px;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
        }
        .tab.active {
            border-bottom-color: var(--vscode-focusBorder);
            background: var(--vscode-tab-activeBackground);
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">${subject} v${version}</h1>
        <div class="actions">
            <button class="btn secondary" id="copyBtn">Copy</button>
            <button class="btn secondary" id="exportBtn">Export</button>
            <button class="btn" id="saveBtn" ${isReadonly ? 'disabled' : ''}>Save Changes</button>
        </div>
    </div>

    <div class="tabs">
        <button class="tab active" data-tab="editor">Schema Editor</button>
        ${isJsonSchema ? '<button class="tab" data-tab="fields">Fields</button>' : ''}
        <button class="tab" data-tab="raw">Raw JSON</button>
    </div>

    <div class="tab-content active" id="editor-tab">
        <div class="section">
            <h3>Schema Information</h3>
            <div class="form-row">
                <label>Subject:</label>
                <input type="text" id="subject" value="${subject}" readonly>
            </div>
            <div class="form-row">
                <label>Version:</label>
                <input type="number" id="version" value="${version}" readonly>
            </div>
            <div class="form-row">
                <label>Schema ID:</label>
                <input type="number" id="schemaId" value="${schema.id || ''}" readonly>
            </div>
            <div class="form-row">
                <label>Schema Type:</label>
                <select id="schemaType" ${isReadonly ? 'disabled' : ''}>
                    <option value="AVRO" ${schemaType === 'AVRO' ? 'selected' : ''}>AVRO</option>
                    <option value="JSON" ${schemaType === 'JSON' ? 'selected' : ''}>JSON Schema</option>
                    <option value="PROTOBUF" ${schemaType === 'PROTOBUF' ? 'selected' : ''}>Protocol Buffers</option>
                </select>
            </div>
            <div class="form-row">
                <label>Compatibility:</label>
                <select id="compatibility" ${isReadonly ? 'disabled' : ''}>
                    <option value="BACKWARD" ${compatibility === 'BACKWARD' ? 'selected' : ''}>Backward</option>
                    <option value="BACKWARD_TRANSITIVE" ${compatibility === 'BACKWARD_TRANSITIVE' ? 'selected' : ''}>Backward Transitive</option>
                    <option value="FORWARD" ${compatibility === 'FORWARD' ? 'selected' : ''}>Forward</option>
                    <option value="FORWARD_TRANSITIVE" ${compatibility === 'FORWARD_TRANSITIVE' ? 'selected' : ''}>Forward Transitive</option>
                    <option value="FULL" ${compatibility === 'FULL' ? 'selected' : ''}>Full</option>
                    <option value="FULL_TRANSITIVE" ${compatibility === 'FULL_TRANSITIVE' ? 'selected' : ''}>Full Transitive</option>
                    <option value="NONE" ${compatibility === 'NONE' ? 'selected' : ''}>None</option>
                </select>
            </div>
        </div>
        
        <div class="section">
            <h3>Schema Definition</h3>
            <div class="form-row">
                <textarea id="schemaContent" class="schema-editor" ${isReadonly ? 'readonly' : ''}>${schemaString}</textarea>
            </div>
            <div id="schemaError" class="error"></div>
            <div id="schemaSuccess" class="success"></div>
        </div>
    </div>

    ${isJsonSchema ? `
    <div class="tab-content" id="fields-tab">
        <div class="section">
            <h3>Schema Fields</h3>
            <div id="fieldsContainer">
                ${this.renderFields(parsedSchema)}
            </div>
            <button class="add-field" onclick="addField()">+ Add Field</button>
        </div>
    </div>
    ` : ''}

    <div class="tab-content" id="raw-tab">
        <div class="section">
            <h3>Raw Schema Response</h3>
            <pre style="background: var(--vscode-textCodeBlock-background); padding: 12px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">${JSON.stringify(schema, null, 2)}</pre>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentSchema = ${JSON.stringify(parsedSchema)};
        
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                // Update tab states
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(tabName + '-tab').classList.add('active');
            });
        });

        // Copy button
        document.getElementById('copyBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'copy' });
        });

        // Export button
        document.getElementById('exportBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'export' });
        });

        // Save button
        document.getElementById('saveBtn').addEventListener('click', () => {
            const schemaContent = document.getElementById('schemaContent').value;
            const schemaType = document.getElementById('schemaType').value;
            const compatibility = document.getElementById('compatibility').value;
            
            let parsedContent;
            try {
                parsedContent = JSON.parse(schemaContent);
            } catch (e) {
                document.getElementById('schemaError').textContent = 'Invalid JSON: ' + e.message;
                return;
            }
            
            document.getElementById('schemaError').textContent = '';
            
            vscode.postMessage({
                command: 'save',
                schema: schemaContent,
                schemaType: schemaType,
                compatibility: compatibility,
                parsedSchema: parsedContent
            });
        });

        // Schema content change validation
        document.getElementById('schemaContent').addEventListener('input', (e) => {
            const content = e.target.value;
            try {
                JSON.parse(content);
                document.getElementById('schemaError').textContent = '';
                document.getElementById('schemaSuccess').textContent = 'Valid JSON';
            } catch (err) {
                document.getElementById('schemaError').textContent = 'Invalid JSON: ' + err.message;
                document.getElementById('schemaSuccess').textContent = '';
            }
        });

        // Field management for JSON schemas
        function addField() {
            const container = document.getElementById('fieldsContainer');
            const fieldRow = document.createElement('div');
            fieldRow.className = 'field-row';
            fieldRow.innerHTML = \`
                <input type="text" placeholder="Field name" onchange="updateField(this)">
                <select onchange="updateField(this)">
                    <option value="string">string</option>
                    <option value="int">int</option>
                    <option value="long">long</option>
                    <option value="float">float</option>
                    <option value="double">double</option>
                    <option value="boolean">boolean</option>
                    <option value="array">array</option>
                    <option value="record">record</option>
                </select>
                <button class="remove-field" onclick="removeField(this)">×</button>
            \`;
            container.appendChild(fieldRow);
        }

        function removeField(button) {
            button.parentElement.remove();
            updateSchemaFromFields();
        }

        function updateField(input) {
            updateSchemaFromFields();
        }

        function updateSchemaFromFields() {
            // This would update the schema based on field changes
            // Implementation depends on schema type (AVRO vs JSON Schema)
        }

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'showError':
                    document.getElementById('schemaError').textContent = message.text;
                    break;
                case 'showSuccess':
                    document.getElementById('schemaSuccess').textContent = message.text;
                    document.getElementById('schemaError').textContent = '';
                    break;
            }
        });
    </script>
</body>
</html>`;
  }

  private renderFields(parsedSchema: any): string {
    if (!parsedSchema || !parsedSchema.fields || !Array.isArray(parsedSchema.fields)) {
      return '<p>No fields to display (not an AVRO record schema)</p>';
    }

    return parsedSchema.fields.map((field: any, index: number) => `
      <div class="field-row">
        <input type="text" value="${field.name || ''}" placeholder="Field name" onchange="updateField(this)">
        <select onchange="updateField(this)">
          <option value="string" ${field.type === 'string' ? 'selected' : ''}>string</option>
          <option value="int" ${field.type === 'int' ? 'selected' : ''}>int</option>
          <option value="long" ${field.type === 'long' ? 'selected' : ''}>long</option>
          <option value="float" ${field.type === 'float' ? 'selected' : ''}>float</option>
          <option value="double" ${field.type === 'double' ? 'selected' : ''}>double</option>
          <option value="boolean" ${field.type === 'boolean' ? 'selected' : ''}>boolean</option>
          <option value="array" ${Array.isArray(field.type) || field.type === 'array' ? 'selected' : ''}>array</option>
          <option value="record" ${typeof field.type === 'object' && field.type.type === 'record' ? 'selected' : ''}>record</option>
        </select>
        <button class="remove-field" onclick="removeField(this)">×</button>
      </div>
    `).join('');
  }

  private setupMessageHandlers(panel: any, schema: any, meta: any, subject: string, version: number, client: SchemaRegistryClient, store: any) {
    panel.webview.onDidReceiveMessage(async (message: any) => {
      const oc = getOutputChannel();
      
      switch (message.command) {
        case 'copy':
          try {
            // Copy the current schema to clipboard (similar to copySchema command)
            (global as any).connectAdminSchemaClipboard = { 
              subject, 
              versions: [{ version, schema }] 
            };
            vscode.window.showInformationMessage(`Copied schema ${subject} v${version}`);
          } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to copy: ${e.message || e}`);
          }
          break;

        case 'export':
          try {
            // Export schema to a file
            const fileName = `${subject}-v${version}.json`;
            const uri = await (vscode as any).window.showSaveDialog({
              defaultUri: (vscode as any).Uri.file(fileName),
              filters: { 'JSON files': ['json'] }
            });
            
            if (uri) {
              const content = JSON.stringify(schema, null, 2);
              await (vscode as any).workspace.fs.writeFile(uri, Buffer.from(content));
              vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
            }
          } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to export: ${e.message || e}`);
          }
          break;

        case 'save':
          try {
            oc.appendLine(`[schema-view] Saving schema ${subject} with type ${message.schemaType}`);
            
            // Create the payload for registration
            const payload: any = {
              schema: message.schema,
              schemaType: message.schemaType
            };

            // Register the new version
            const regResult = await client.registerSchema(subject, payload);
            oc.appendLine(`[schema-view] Registration result: ${JSON.stringify(regResult)}`);

            // Set compatibility level if changed
            if (message.compatibility) {
              try {
                await client.setCompatibility(subject, message.compatibility);
                oc.appendLine(`[schema-view] Updated compatibility to ${message.compatibility}`);
              } catch (e: any) {
                oc.appendLine(`[schema-view] Failed to update compatibility: ${e.message || e}`);
              }
            }

            panel.webview.postMessage({ 
              command: 'showSuccess', 
              text: `Schema saved successfully. New version: ${regResult.id || 'unknown'}` 
            });

            // Refresh the tree to show the new version
            vscode.commands.executeCommand('connectAdmin.refreshConnections');
            
          } catch (e: any) {
            oc.appendLine(`[schema-view] Save failed: ${e.message || e}`);
            panel.webview.postMessage({ 
              command: 'showError', 
              text: `Failed to save: ${e.message || e}` 
            });
          }
          break;
      }
    });
  }
}
