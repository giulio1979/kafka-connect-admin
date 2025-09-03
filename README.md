# Connect Admin (VS Code Extension)

Connect Admin is a VS Code extension to manage Apache Kafka Connect clusters and Confluent Schema Registry instances directly from the editor.

This README documents the features implemented in this repository, how to run and test the extension, and short usage notes.

## Features (implemented)

- Connections management
	- Store multiple named connections for two connection types: Kafka Connect (`connect`) and Schema Registry (`schema-registry`).
	- Add, edit, remove and test connections from a Connection Manager webview.
	- Credentials/secrets are stored securely using the VS Code SecretStorage API.
	- Supports authentication modes: none, basic (username+password), and bearer token.

- Explorer tree view
	- A custom explorer view is contributed under the `Explorer` panel named "Connect Admin" showing registered connections, connectors, subjects and schema versions.
	- Right-click context menu actions are available per-item (refresh, edit, remove, copy/paste schema, connector actions).

- Commands (typical / useful ones implemented)
	- connectAdmin.addConnection — open Connection Manager to add a new connection
	- connectAdmin.editConnection / connectAdmin.openEditConnection — edit an existing connection
	- connectAdmin.removeConnection — remove a saved connection
	- connectAdmin.testConnection — test a connection (Connect: list connectors, Schema Registry: list subjects)
	- connectAdmin.refreshConnections — refresh the Connections tree
	- connectAdmin.connector.pause / connectAdmin.connector.resume — pause or resume a connector
	- connectAdmin.connector.showOffsets — open the connector offsets/consumer-position view
	- connectAdmin.copySchema / connectAdmin.pasteSchema / connectAdmin.pasteSchemaToConnection — copy a schema (including multi-version payloads) and paste it into another registry or connection
	- connectAdmin.copySchemaVersion — copy a single schema version
	- connectAdmin.copySchemaVersion / connectAdmin.pasteSchemaVersion (hooks present for version-level copy/paste)
	- connectAdmin.openConnector / connectAdmin.openSchemaVersion — open connector details or a specific schema version in a webview

- Schema copy & paste
	- Copy a schema subject (fetches all available versions) into an in-memory clipboard used by the extension.
	- Paste supports multi-version replay (registers versions in ascending order) and single-schema payloads.
	- Paste includes best-effort verification: attempts to fetch the registered schema, checks by id when returned, and performs diagnostic lookups when verification fails.
	- Robust handling of different schema payload shapes (various JSON payloads, schema vs schemaString, nested objects, Avro/JSON payloads).

- Connector management
	- Pause and resume connectors via Connect REST API.
	- Open connector view to inspect and edit connector offsets (OffsetEditor/ConnectorView webviews).

- UI and developer convenience
	- Connection Manager webview for add/edit flows.
	- Connector webview and offset editor.
	- Simple status bar item for quick access to the Connection Manager.
	- Extension output channel logging for diagnostic messages.

- Clients and integration
	- HTTP clients for Connect and Schema Registry interactions (including an OfficialSchemaRegistryClient wrapper).
	- Docker Compose configuration included for bringing up an integration stack (Kafka, Connect, Schema Registry) used by integration tests.

## Quickstart (developer)

1. Install dependencies:

```powershell
npm install
```

2. Build the extension:

```powershell
npm run build
```

3. Run unit tests:

```powershell
npm test
```

4. Run (development):
	 - Open this folder in VS Code and run the "Run Extension" launch configuration in the Debug panel. The extension will activate and the `Connect Admin` tree view will appear in Explorer.

## How to use

- Adding a connection
	- Use the Command Palette (Ctrl+Shift+P) and run `Connect Admin: Add Connection` (or `connectAdmin.addConnection`) to open the Connection Manager webview.
	- Provide a name, URL, type (Connect or Schema Registry) and optional auth settings. Secrets are saved in VS Code secure storage.

- Managing connectors
	- Expand a `connect` connection in the Connect Admin view and choose a connector. Right-click to pause/resume or open offsets.

- Copying & pasting schemas
	- Right-click a schema subject and choose Copy Schema to copy all versions into the extension clipboard.
	- Navigate to another Schema Registry connection (or a subject under a connection) and choose Paste Schema (or Paste Schema to Connection) to register the schema(s) there.
	- When pasting, you can change the target subject name. The extension will attempt verification and will log diagnostics to the output channel.

## Configuration & security

- Secrets: username/password or bearer tokens are stored using the VS Code SecretStorage API and are never written to disk in plaintext.
- The extension stores connection metadata (id, name, url, type, authType, username) in `globalState` under `connectAdmin.connections.v1`.

## Docker Compose (integration test environment)

This repository includes `docker-compose.yml` which starts a small local testing stack:

- Zookeeper
- Kafka broker
- Kafka Connect (REST port 8083)
- Two Schema Registry instances (host ports 8081 and 8082)
- An init container that registers a sample connector using `docker/connector.json`

Start the stack (from the project root):

```powershell
docker compose up --build
```

Notes: When running tests from WSL or using Docker Desktop on Windows, use `localhost:8083` for the Connect REST API.

## Testing

- Unit tests: Jest is configured. Run `npm test` to run unit tests (the test harness runs in-band for easier debugging).

## Development scripts

- npm run build — compile TypeScript (tsc -p ./)
- npm run watch — compile in watch mode
- npm test — run Jest tests
- npm run lint — eslint (if configured)

## Logging & Diagnostics

- The extension writes diagnostic messages to an Output Channel (visible in VS Code under "Output -> Connect Admin"), useful for troubleshooting copy/paste and registry interactions.

## Limitations & Next steps

- Some UI flows and webview polish can be improved (form validation, richer connector inspector, pagination for large subject lists).
- Schema transfer tries to be robust but some registry implementations may behave differently; diagnostics are written to the output channel for troubleshooting.

## Contributing

Please open issues or PRs with bug reports, feature requests, or improvements. Follow the existing code style and include tests for new behavior.

## License

This repository does not contain a license file. Please verify licensing with the project owner before publishing.
