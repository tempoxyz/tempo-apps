# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-21

### Added
- **Common Package (`@tempo-agent/common`)**:
  - Shared constants and types across server and SDK
  - Centralized `ERC20_ABI`, `PATH_USD_ADDRESS`, `TESTNET_RPC`
  - `PaymentInfo`, `PaymentError`, and `RATE_LIMIT_HEADERS` types

- **Server Package (`@tempo-agent/server`)**:
  - **Atomic Replay Protection**: Redis SETNX prevents race conditions
  - **Rate Limiting**: Distributed rate limiting with `rate-limiter-flexible`
  - **Structured Logging**: Production-grade JSON logs with Pino
  - Standard `X-RateLimit-*` headers (Limit, Remaining, Reset)
  - Comprehensive test suite (9 passing tests)

### Changed
- **Server**: Redis is now **required** for production deployments
- **Server**: Replay protection uses atomic `SET NX EX` operation
- **Server**: Replaced console logging with Pino structured logger
- **Server**: Rate limiting integrated into `createPaymentGate` middleware

### Fixed
- **Critical**: Race condition in payment verification (parallel requests could bypass replay protection)
- **Server**: Fail-closed behavior when Redis connection errors occur

### Security
- Atomic transaction locking prevents replay attacks
- Distributed rate limiting protects against abuse
- Structured logging improves audit trails

## [Unreleased]

### Added
- **SDK Package (`@tempo-agent/sdk`)**:
  - Input validation for constructor parameters (private key, RPC URL, fee token)
  - Logging abstraction with `Logger` interface and `ConsoleLogger`/`SilentLogger` implementations
  - Request timeout configuration (default: 30 seconds)
  - Custom error class `PaymentFailureError` with stack trace preservation
  - Comprehensive unit tests for agent and logger
  - User-Agent header in HTTP requests
  - Centralized ERC20 ABI in constants

- **Server Package (`@tempo-agent/server`)**:
  - Optional Redis support for persistent replay protection
  - Logging abstraction for verification process
  - Optimized RPC calls (parallelized independent calls)
  - Configurable age limit for transaction verification
  - Server constants module for package independence
  - Health check endpoint example

- **Demo**:
  - Production-ready server example with graceful shutdown
  - HTTPS redirect middleware
  - Error handling middleware
  - Health check endpoint

- **Tooling**:
  - ESLint configuration for TypeScript
  - Comprehensive test suite
  - Changelog (this file)
  - Contributing guide

### Changed
- **SDK**: Replaced direct `console.log` usage with logger abstraction
- **SDK**: Improved error messages with context preservation
- **Server**: Replaced direct `console.log` usage with logger abstraction
- **Server**: Made Redis optional (falls back to in-memory for demo)
- **Server**: Optimized verification by parallelizing RPC calls (~33% faster)
- **Demo**: Updated server to use proper package imports

### Fixed
- Cross-package import anti-pattern (server importing from SDK source)
- Missing request timeout causing potential hanging requests
- Generic error messages losing original error context
- Hard-coded ERC20 ABI duplication
- Blocking RPC calls in verification

### Security
- Added input validation to prevent invalid configuration
- Added optional Redis support for replay protection persistence
- Added configurable transaction age limits
- Improved error handling to prevent information leakage
- Added graceful shutdown to prevent abrupt connection termination

## [0.1.0] - 2026-01-20

### Added
- Initial release
- SDK package for autonomous agents
- Server package for payment gates
- Demo example with basic functionality
- Replay protection with age checks
- Transaction verification (recipient, amount, token)
- Mutex for nonce management
- TypeScript strict mode
- Basic documentation

### Security
- In-memory replay protection (demo-grade)
- Transaction age verification
- ERC20 transfer decoding and validation
- Recipient and amount verification
