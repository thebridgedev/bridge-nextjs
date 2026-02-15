# Bridge Next.js Demo & Library Documentation

This repository contains both the Bridge Next.js library and a demo application showcasing its features.

## Quick Links
- [Quickstart Guide](learning/quickstart/quickstart.md) - Get started quickly with Bridge in your Next.js application
- [Examples](learning/examples/examples.md) - Detailed examples of Bridge features

## Table of Contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [Feature Flags](#feature-flags)
- [Payments & Subscriptions](#payments--subscriptions)
- [Demo Application](#demo-application)
- [E2E Tests](#e2e-tests)
- [Publishing & Release](#publishing--release)

## Installation

```bash
npm install @nebulr-group/bridge-nextjs
```

## Configuration

For detailed configuration instructions, see the [Quickstart Guide](learning/quickstart/quickstart.md).


## Authentication

For authentication examples and implementation details, see:
- [Quickstart Guide - Authentication](learning/quickstart/quickstart.md#authentication)
- [Examples - Authentication](learning/examples/examples.md#authentication)

## Feature Flags

For feature flag examples and implementation details, see:
- [Examples - Feature Flags](learning/examples/examples.md#feature-flags)

## Payments & Subscriptions

The library supports redirecting users to Bridge's plan selection and subscription portal (e.g. via a plan service). See the [Examples](learning/examples/examples.md) for subscription and payment patterns.

## Demo Application

The demo application in this repository contains runnable examples of the usage patterns found in the [examples](learning/examples/examples.md) documentation.

## E2E Tests

E2E tests use Playwright. Run them from the repo root.

1. **Configure env:** Copy `config/.env.test.local.example` to `config/.env.test.local` and fill in the values (test data API key, etc.).
2. **Pre-setup:** The first step of `test:e2e` runs a pre-setup script that creates/gets the test app and writes `NEXT_PUBLIC_BRIDGE_APP_ID` into `demo/.env.test.local` so the demo starts with the correct app.
3. **Install browsers (once):** `npx playwright install`
4. **Run tests:**
   - `npm run test:e2e` — local (starts demo on port 3001, runs Playwright)
   - `npm run test:e2e:stage` — stage
   - `npm run test:e2e:prod` — prod
   - `npm run test:e2e:headed` — local with browser visible
   - `npm run test:e2e:report` — open last HTML report

## Publishing & Release

Bridge Next.js is published to npm via GitHub Actions. To release a new version, update the version in `bridge-nextjs/package.json`, merge to `main`, and tag the release (e.g. `v0.1.0`).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.