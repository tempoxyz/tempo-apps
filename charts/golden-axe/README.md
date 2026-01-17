# Golden Axe Helm Chart

Self-hosted SQL API for Ethereum blockchain data from [indexsupply/golden-axe](https://github.com/indexsupply/golden-axe).

## Components

- **Backend (be)**: Rust/Axum API that handles SQL queries against blockchain data
- **Frontend (fe)**: Web application for account management, API keys, and documentation
- **PostgreSQL**: Two CloudNativePG clusters for backend and frontend data

## Prerequisites

- Kubernetes 1.25+
- Helm 3.0+
- CloudNativePG operator installed
- 1Password Connect operator (for secrets)
- Container image built from golden-axe source

## Installation

```bash
helm install golden-axe ./charts/golden-axe \
  --namespace golden-axe \
  --create-namespace \
  -f my-values.yaml
```

## 1Password Secrets

Create a 1Password item with the following keys:

| Key | Required | Description |
|-----|----------|-------------|
| `be-pg-url` | Yes | Backend PostgreSQL connection string |
| `be-pg-url-ro` | Yes | Read-only PostgreSQL connection for API queries |
| `fe-pg-url` | Yes | Frontend PostgreSQL connection string |
| `admin-api-secret` | Yes | Secret for admin endpoints |
| `session-key` | No | Hex-encoded session encryption key |
| `postmark-key` | No | Postmark email API key |
| `stripe-key` | No | Stripe secret key |
| `stripe-pub-key` | No | Stripe publishable key |

## Configuration

See [values.yaml](./values.yaml) for all configuration options.

### Key Configuration

```yaml
# Chain configuration
chain:
  rpcUrl: "http://reth-service:8545"
  chainId: 1

# Enable/disable components
backend:
  enabled: true
  sync:
    enabled: true  # Set false for query-only mode

frontend:
  enabled: true

# Ingress
ingress:
  enabled: true
  className: tailscale
  hosts:
    backend: api.golden-axe.example.com
    frontend: golden-axe.example.com
```

## Building Container Images

Golden Axe doesn't provide pre-built images. Build and push to your registry:

```bash
git clone git@github.com:indexsupply/golden-axe.git
cd golden-axe

# Build backend
docker build -f be/Dockerfile -t ghcr.io/yourorg/golden-axe/be:latest .
docker push ghcr.io/yourorg/golden-axe/be:latest

# Build frontend
docker build -f fe/Dockerfile -t ghcr.io/yourorg/golden-axe/fe:latest .
docker push ghcr.io/yourorg/golden-axe/fe:latest
```

## API Endpoints

### Backend (port 8000)
- `GET /` - Health check
- `GET /status` - SSE stream of blockchain status
- `GET/POST /query` - SQL query endpoint
- `GET/POST /v2/query` - SQL query endpoint (v2)
- `GET /query-live` - SSE stream for live queries

### Frontend (port 8001)
- `GET /` - Main index
- `GET /docs` - API documentation
- `GET /login` - Login page
- `GET /account` - User account dashboard
