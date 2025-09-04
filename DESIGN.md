# Connect Admin — VS Code Extension Design

Date: 2025-08-30

Purpose: capture the first-stage design for a VS Code extension to manage Kafka Connect clusters and Confluent Schema Registry instances. This document defines requirements, architecture, UI, API interactions, security, MVP scope, and an implementation plan.

## Requirements checklist
- [x] Manage multiple connections
  - [x] Add / Remove / Edit connection to Kafka Connect cluster or Schema Registry
  - [x] Include basic authentication capabilities (Basic, Bearer token)
- [x] Start / Stop / Pause connector
- [x] Display current offset (RAW / as String) in an editable text area
- [x] Modify offset and set it to the connector
- [x] Copy schema from one Schema Registry to another (commander-style view), two registries side-by-side
- [x] **Fixed**: Multiple connector views stability issue (v0.0.5 patch)

Notes: items above are the scope for the design and planned MVP. Implementation will follow this document.

## High-level summary
A TypeScript-based VS Code extension running in the extension host that provides:
- A Connection Manager to add/edit/remove Kafka Connect / Schema Registry endpoints and store secrets securely using VS Code SecretStorage.
- A Tree View UI showing configured Connect clusters and Schema Registries.
- Commands and context-menu actions to start/stop/pause connectors.
- An Offsets Editor webview showing raw JSON and a formatted string view (editable) and the ability to PUT offsets back to a connector.
- A Schema Commander webview with two panes (left/right) to compare and copy subject versions between registries.

## Contracts
- Inputs: connection definitions (name, url, type, auth), connector name, offsets (JSON/text), subject + version
- Outputs: REST calls to Connect/Schema Registry and UI feedback (notifications, logs)
- Success criteria: user can manage connections, control connectors, view/edit offsets, and copy schemas between registries via the extension UI

## Architecture & Components
- `extension.ts` — activation entry, command registration, view wiring
- Connection Manager
  - Persists connection metadata (name, url, type, authType) in global state or workspace state
  - Stores secrets (passwords, tokens) in `SecretStorage`
  - Provides APIs to list, add, edit, remove, and test connections
- API clients
  - `ConnectClient` — wrapper for Confluent Connect REST API (GET /connectors, GET /connectors/{name}/status, pause/resume/restart, offsets endpoints)
  - `SchemaRegistryClient` — wrapper for Schema Registry REST API (GET /subjects, GET /subjects/{subject}/versions, GET/POST version)
  - HTTP helper with timeout, retries, and auth header injection
- UI
  - TreeDataProvider for Connections view (two top-level branches: Connect Clusters, Schema Registries)
  - Context menu commands on nodes (Start/Stop/Pause/Offsets, Copy Schema)
  - Webviews: Offsets Editor and Schema Commander
- Storage
  - Metadata in `Memento` (`globalState` by default)
  - Secrets in `vscode.SecretStorage`
- Logging
  - Output channel `Connect Admin` for detailed debug logs
  - Notifications for user-facing success/error messages

## Key UX flows
1. Add connection (QuickPick + InputBoxes or a small webview form)
   - Fields: Name, Type (Connect / Schema Registry), Base URL, Auth Type (None / Basic / Bearer), Username, Password / Token
   - Option: Test connection
   - Save metadata and secret to SecretStorage
2. Tree view navigation
   - Connect Cluster node -> Connectors list -> Connector node: context actions Start / Stop / Pause / Resume / Show Offsets
   - Schema Registry node -> Subjects -> Versions -> context action: Copy to other registry
3. Offsets webview
   - Tabs: RAW (editable JSON) and String (formatted, editable)
   - Actions: Validate JSON, Preview diff, Apply (PUT to connector offsets endpoint)
   - Show request/response details in logs (no secrets)
4. Schema Commander webview
   - Two side-by-side panes, each bound to a configured Schema Registry connection
   - List of subjects and selectable versions; actions to copy selected version or full subject
   - Progress log and per-item result reporting

## API interactions (representative endpoints)
- Kafka Connect (examples):
  - List connectors: GET /connectors
  - Connector status: GET /connectors/{name}/status
  - Pause connector: PUT /connectors/{name}/pause or POST depending on server; check API and fallbacks
  - Resume connector: PUT /connectors/{name}/resume
  - Offsets: GET /connectors/{name}/offsets (or GET /connectors/{name}/tasks/{task}/offsets) — confirm exact endpoint during implementation; PUT to set offsets
- Schema Registry:
  - List subjects: GET /subjects
  - Versions: GET /subjects/{subject}/versions
  - Get schema by version: GET /subjects/{subject}/versions/{version}
  - Register schema: POST /subjects/{subject}/versions

Implementation note: the Confluent docs contain variations between OSS Schema Registry and Confluent Cloud APIs; clients should be flexible and inspect HTTP response codes and payload shapes.

## Authentication
- Support Basic auth and Bearer token out-of-the-box
- Storage: secrets stored in `SecretStorage` keyed to a connection ID; metadata stored in Memento
- UI: store username in metadata (non-secret), store password/token in `SecretStorage`
- Security: warn when URL is HTTP; never write secrets to workspace files

## Persistence & Sync
- Default to `globalState` for connection list
- Provide import/export (JSON metadata only, excluding secrets) as a convenience

## Errors, retries, and cancellation
- HTTP helper with configurable timeout (default 10s) and exponential backoff for GETs
- Respect VS Code CancellationToken for long operations (list connectors, large subject lists)
- Surface errors succinctly to users and full details to the `Connect Admin` output channel

## Edge cases / known risks
- API differences between server versions
- Large subject lists may require lazy loading/pagination
- Schema compatibility errors during copy
- Concurrent offset edits — provide fetch/refresh and warn before overwrite

## Test strategy & quality gates
- Unit tests for clients (mock HTTP) and connection storage (mock SecretStorage)
- Basic integration smoke tests: add connection -> list connectors -> show offsets
- CI: build (tsc), lint (ESLint), tests (jest)

## MVP scope (first stage implementation)
- Connection management (add/edit/remove) with Basic/Bearer auth and SecretStorage
- Tree view listing Connectors and Schema Registry subjects
- Start/Stop/Pause connector commands
- Offsets webview for viewing/editing/applying offsets
- Schema Commander webview with single-version copy between two registries

## File map (MVP)
- `package.json` — extension manifest
- `src/extension.ts` — activation and command registration
- `src/connectionStore.ts` — CRUD + SecretStorage helpers
- `src/clients/connectClient.ts` — Connect REST client
- `src/clients/schemaRegistryClient.ts` — Schema Registry client
- `src/views/connectionsTree.ts` — TreeDataProvider
- `src/webviews/offsetEditor.ts` — offsets webview controller
- `src/webviews/schemaCommander.ts` — schema commander webview controller
- `src/utils/http.ts` — fetch wrapper (timeout/retry)
- `README.md` — usage and dev guide

## Implementation milestones (high level)
1. Scaffold extension and connection storage
2. Implement clients and test client mocks
3. Implement tree view and basic listing
4. Implement connector control commands
5. Implement offsets webview
6. Implement schema commander webview
7. Tests and polish

## Next steps
- Start scaffolding the extension and implement the Connection Manager and API clients.
- Deliverables for the next checkpoint: `package.json`, `src/extension.ts`, `src/connectionStore.ts`, `src/clients/*` stubs, and basic tree view wiring.

## Known Issues & Fixes

### Multiple Connector Views Data Mixing (Fixed in v0.0.5)

**Issue**: When multiple connectors were opened simultaneously, the connector views would randomly show data from different connectors, creating an unstable and confusing user experience.

**Root Cause**: The `ConnectorView` class was designed as a singleton with a single `panel` property. When opening multiple connectors:
1. All connectors shared the same webview panel instance
2. The HTML content was replaced without proper isolation between connectors
3. Event handlers were overwritten, causing actions from one connector to affect another
4. The auto-refresh timer (15-second interval) would refresh with random connector data

**Technical Details**:
```typescript
// Problem: Single panel instance shared across all connectors
export class ConnectorView {
  private panel?: any;  // ❌ Shared panel causes data mixing
  
  public async open(connMeta: ConnectionMeta, connectorName: string, store: any) {
    if (this.panel) {
      this.panel.reveal();  // ❌ Reuses existing panel
    } else {
      this.panel = vscode.window.createWebviewPanel(...);
    }
    // ❌ HTML content gets replaced, events overwritten
    this.panel.webview.html = html;
  }
}
```

**Solution**: Implemented per-connector panel isolation using a Map-based approach:
```typescript
// Fix: Separate panel instances per connector
export class ConnectorView {
  private panels: Map<string, any> = new Map();  // ✅ Panel per connector
  
  public async open(connMeta: ConnectionMeta, connectorName: string, store: any) {
    const id = `connector-${connMeta.id}-${connectorName}`;
    let panel = this.panels.get(id);
    if (panel) {
      panel.reveal();
      return;  // ✅ Don't reprocess if panel exists
    } else {
      panel = vscode.window.createWebviewPanel(...);
      this.panels.set(id, panel);  // ✅ Store unique panel
      panel.onDidDispose(() => { this.panels.delete(id); });  // ✅ Cleanup
    }
    // ✅ Each connector has its own isolated webview
  }
}
```

**Benefits**:
- Each connector now has its own isolated webview panel
- Data no longer mixes between different connectors
- Actions (pause, resume, restart) are properly scoped to the correct connector
- Auto-refresh works independently for each connector
- Memory is properly cleaned up when panels are closed

**Files Modified**:
- `src/views/connectorView.ts`: Complete refactor of panel management

---

Appendix: references
- Confluent Connect REST API: https://docs.confluent.io/platform/current/connect/references/restapi.html
- Schema Registry API: https://docs.confluent.io/platform/current/schema-registry/develop/api.html


