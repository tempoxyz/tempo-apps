# Example Implementations

**Reference Implementations for the Tempo Agentic Layer.**

The following examples demonstrate standard integration patterns for financial settlement gating.

### Prerequisites

1. **Install Dependencies** (Monorepo Root):
   ```bash
   pnpm install
   ```

2. **Environment Configuration**:
   Configure the environment variables based on the provided `.env.example` template.
   ```bash
   cp apps/agentic-layer/examples/demo/.env.example apps/agentic-layer/examples/demo/.env
   ```

3. **Execute Service (Express)**:
   ```bash
   cd apps/agentic-layer/examples/demo
   pnpm start:server:express
   ```

4. **Execute Agent Implementation**:
   In a secondary terminal:
   ```bash
   cd apps/agentic-layer/examples/demo
   pnpm start:agent
   ```

---

## Available Examples

### 1. CLI Implementation Reference (`/examples/demo`)
A command-line interface demonstration encompassing:
- **Express.js Middleware**: Standard REST API implementation.
- **Hono Middleware**: Performance-optimized edge implementation.
- **Autonomous SDK Usage**: Direct agent-side settlement logic.
- **Unified Configuration**: Centralized environment variable management (`TEMPO_*`).

### 2. Web Visualizer (`/examples/web-demo`)
A React-based interface for monitoring settlement flows:
- Real-time on-chain verification monitoring.
- Transaction finality status tracking.
- Secure content delivery post-settlement.

### 3. AI Agent Integration
Technical specification for integrating LLM-driven agents with 402 settlement tools.

