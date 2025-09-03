# Changelog

All notable changes to this project will be documented in this file.

The format is based on "Keep a Changelog" and this project follows semantic versioning where possible.

## [Unreleased]
- Planned: automation for changelog generation on release (optional)

## [0.0.1] - 2025-09-03
### Added
- Initial published extension implementation: Connect Admin (VS Code)
- Connection management: add/edit/remove connections for Kafka Connect and Schema Registry
- Secret storage using VS Code SecretStorage (supports Basic and Bearer auth)
- Explorer `Connect Admin` tree view listing connections, connectors, subjects and versions
- Commands:
  - `connectAdmin.addConnection`, `connectAdmin.editConnection`, `connectAdmin.removeConnection`, `connectAdmin.testConnection`, `connectAdmin.refreshConnections`
  - Connector actions: `connectAdmin.connector.pause`, `connectAdmin.connector.resume`, `connectAdmin.connector.showOffsets`
  - Schema clipboard: `connectAdmin.copySchema`, `connectAdmin.pasteSchema`, `connectAdmin.pasteSchemaToConnection`, `connectAdmin.copySchemaVersion`, `connectAdmin.pasteSchemaVersion`
  - `connectAdmin.openConnector`, `connectAdmin.openSchemaVersion`
- Schema copy & paste with multi-version support and verification (best-effort diagnostics and logging)
- Offset editor and connector webviews (offsets viewing/editing and connector details)
- Output channel logging for diagnostics and debug messages
- Small status bar item for quick Connection Manager access
- Integration Docker Compose stack for local testing (Kafka, Connect, Schema Registry)
- Unit tests scaffolded with Jest and basic test coverage for storage and clients

### Notes
- Connection metadata is stored in `globalState` (`connectAdmin.connections.v1`) and secrets in SecretStorage.
- Verification and copy/paste include additional diagnostic attempts when registry implementations behave differently.

---

