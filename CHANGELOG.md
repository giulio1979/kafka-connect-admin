# Changelog

All notable changes to this project will be documented in this file.

The format is based on "Keep a Changelog" and this project follows semantic versioning where possible.

## [Unreleased]
- Planned: automation for changelog generation on release (optional)

## [0.0.5-patch] - 2025-09-04
### Fixed
- **Critical**: Multiple connector view stability issue where opening multiple connectors would show data randomly from different connectors
- Implemented per-connector panel isolation using Map-based panel management
- Each connector now maintains its own webview panel instance with proper cleanup on disposal
- Fixed data mixing between connector views that was causing unstable behavior in larger environments
- **OffsetEditor**: Applied same Map-based panel management pattern to OffsetEditor for consistency
- **Code Quality**: Removed all debug console.log statements from production code, replaced with proper logging system
- **Tests**: Fixed failing unit tests by adding proper VS Code API mocking for Jest test environment

### Technical Details
- Refactored `ConnectorView` class from singleton pattern to multi-instance panel management
- Refactored `OffsetEditor` class from singleton pattern to multi-instance panel management
- Added unique panel identification using `connector-{connectionId}-{connectorName}` pattern
- Implemented proper memory cleanup with `onDidDispose` handlers to prevent memory leaks
- Each connector view now has isolated auto-refresh timers and event handlers
- Each offset editor now has isolated panel instances per connector
- Replaced 9 production console.log statements with proper logging using VS Code output channel
- All debug logging now goes through centralized `getOutputChannel()` system with consistent formatting
- Added comprehensive VS Code API mock (`__mocks__/vscode.js`) supporting all required interfaces
- Updated Jest configuration with proper setup for VS Code extension testing

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

