# Connect Admin (VS Code Extension)

This is a scaffold for the Connect Admin extension to manage Kafka Connect clusters and Schema Registry instances.

Developer quickstart

1. Install dependencies:

```powershell
npm install
```

2. Build the extension:

```powershell
npm run build
```

3. Run tests:

```powershell
npm test
```

Notes: This is an initial scaffold. The next steps are implementing tree wiring, commands, webviews, and more tests.

Docker Compose for integration tests

This repository includes a `docker-compose.yml` that starts a local Kafka ecosystem for integration testing:

- Zookeeper
- Kafka broker
- 1 Kafka Connect cluster (Connect REST on port 8083)
- 2 Schema Registry instances (ports 8081 and 8082)
- An init container that registers a sample FileStream connector

From WSL or a shell in the project root run:

```powershell
docker compose up --build
```

Notes:
- Schema Registry 1 is exposed on host port 8081 and Schema Registry 2 is exposed on host port 8082.
- The Connect REST API is exposed on host port 8083.
- The init container posts `docker/connector.json` to the Connect REST API once it's available.

Use these endpoints in your integration tests. If running on Windows with WSL, use `localhost:8083` for the Connect REST API from WSL or the Windows host.
