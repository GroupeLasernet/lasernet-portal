# Shared API Contracts

This directory contains TypeScript type definitions that define the API contracts between the portal and the microservices (robot and relfar/laser).

## Files

- **api-types.ts** — Shared TypeScript interfaces and types for all service communication

## Overview

The types in this directory define the shape of data exchanged between:
- **Portal** ↔ **Robot Service** (Elfin Cobot Studio, port 8080)
- **Portal** ↔ **Relfar Laser Service** (port 5000)
- **Portal** internal types (Jobs, Programs, Presets)

## When to Update

Whenever you modify an API endpoint in any service:

1. Update the corresponding type definition in `api-types.ts`
2. Commit the change
3. Update consumers of that API to match the new types

This ensures the portal and all services stay synchronized and type-safe.

## Structure

### Robot Service Types
- `RobotState` — Current robot position and status
- `RobotDiagnostic` — FSM and connection diagnostics
- `RobotConnectRequest/Response` — Connection protocol
- `RobotJogRequest/RobotJogJointRequest` — Movement commands
- `RobotProgram`, `RobotWaypoint`, `RobotSettings` — Program management

### Relfar Laser Service Types
- `RelfarStatus` — Laser connection and register state
- `RelfarConnectRequest` — Connection protocol
- `RelfarScanRequest` — Port scanning
- `RelfarReadRequest/RelfarWriteRequest` — Register access
- `RelfarRegisterData` — Register values

### Job & Program Types
- `Job` — Main job record linking robot programs and laser presets to invoices
- `JobRobotProgram` — Robot program metadata
- `JobLaserPreset` — Laser configuration preset
- `JobInvoice` — Integration with QuickBooks

### Service Health
- `ServiceHealth` — Health check responses

## Usage

Import these types in your services:

```typescript
import type { RobotState, RelfarStatus, Job } from '../shared/api-types';
```
