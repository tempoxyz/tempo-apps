# AI Agent Example 🤖

This example demonstrates an autonomous AI agent that makes decisions about whether to pay for premium data using the Tempo Agentic Layer.

## Components

- **Premium Market Server**: An Express server that protects a `/api/analyze-market` endpoint.
- **Autonomous Agent**: A client that uses the `TempoAgent` SDK to autonomously handle payments.

## Setup

1. **Install dependencies** (from root):
   ```bash
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your `CLIENT_PRIVATE_KEY` and `TEMPO_RECIPIENT`.

## Running the Demo

1. **Start the server**:
   ```bash
   pnpm start:server
   ```

2. **Run the agent**:
   In another terminal:
   ```bash
   pnpm start:agent
   ```

## Key features demonstrated

- **Budget management**: The agent has a "brain" that evaluates if the cost is worth the mission.
- **Autonomous settlement**: The SDK automatically handles the 402 challenge, signs transactions, and retries.
- **Structured Errors**: The agent catches `PAYMENT_FAILURE` and provides clear reasoning.
