# Premium API Example (Hono) 🔥

This example demonstrates a high-performance Hono-based API using the Tempo Agentic Layer for monetization.

## Features

- **Hono Native**: Uses the specialized `fourZeroTwo()` middleware.
- **Multiple Protection Levels**: Different endpoints with different pricing.
- **Zero-Config**: Primary security handled via environment variables.

## Setup

1. **Install dependencies** (from root):
   ```bash
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

## Running the Demo

1. **Start the server**:
   ```bash
   pnpm start:server
   ```

2. **Run the client**:
   ```bash
   pnpm start:client
   ```
