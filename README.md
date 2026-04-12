# Atelier DSM Unified Platform

A comprehensive platform integrating three independent services into a cohesive system for managing robotic automation, laser cutting, and business operations.

## Architecture Overview

This monorepo contains three independently developed services that work together:

### Services

1. **Portal** (Next.js, port 3000)
   - Main user interface and business logic platform
   - Connects to robot and relfar services via their APIs
   - Handles authentication, database operations, and QuickBooks integration
   - Entry point for clients and administrators

2. **Robot** (Python FastAPI, port 8080)
   - Elfin Cobot control and management
   - Handles robot operations, safety, and telemetry
   - RESTful API for external integrations
   - Independent operation possible for testing

3. **Relfar** (Python Flask, port 5000)
   - Laser controller and management system
   - Controls laser operations and settings
   - Provides API for laser-related operations
   - Can run independently for laser diagnostics

## Quick Start

### Prerequisites
- Node.js 18+ (for Portal)
- Python 3.9+ (for Robot and Relfar)
- PostgreSQL 13+ (for Portal database)
- npm or yarn package manager

### Start Individual Services

**Option 1: Run all services at once (Windows)**
```bash
start-all.bat
```

**Option 2: Run services individually**

Portal:
```bash
cd services/portal
npm install
npx prisma generate
npx prisma db push
npm run dev
```
Visit: http://localhost:3000

Robot service:
```bash
cd services/robot
pip install -r requirements.txt
python run.py
```
API: http://localhost:8080

Relfar service:
```bash
cd services/relfar
pip install -r requirements.txt
python server.py
```
API: http://localhost:5000

### Using Docker Compose

For containerized local development:
```bash
docker-compose up
```

This will start:
- PostgreSQL database (port 5432)
- Portal service (port 3000)
- Robot service (port 8080)
- Relfar service (port 5000)

## Environment Configuration

Copy `.env.example` to `.env` and update values for your environment:

```bash
cp .env.example .env
```

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for authentication tokens
- `ROBOT_SERVICE_URL` - URL to robot service
- `RELFAR_SERVICE_URL` - URL to relfar service
- QuickBooks credentials for API integration

## Development Workflow

Each service is independently developed but integrated through APIs:

1. **Portal** communicates with Robot and Relfar via HTTP API calls
2. Services share environment configuration from root `.env`
3. Database operations are isolated to Portal
4. Robot and Relfar operate statelessly for scalability

## Project Structure

```
.
├── README.md
├── .env.example
├── docker-compose.yml
├── start-all.bat
├── services/
│   ├── portal/          # Next.js application
│   ├── robot/           # FastAPI cobot service
│   └── relfar/          # Flask laser controller
└── shared/              # Shared utilities and types (if any)
```

## Service URLs (Local Development)

- **Portal**: http://localhost:3000
- **Robot API**: http://localhost:8080
- **Relfar API**: http://localhost:5000
- **Database**: postgresql://localhost:5432

## Documentation

- See `services/portal/README.md` for Next.js app details
- See `services/robot/README.md` for Robot API documentation
- See `services/relfar/README.md` for Relfar API documentation

## Troubleshooting

**Port already in use?**
Change port in the respective service configuration or .env file.

**Database connection errors?**
Ensure PostgreSQL is running and DATABASE_URL in .env is correct.

**Service not responding?**
Check that all services are running and accessible at their respective URLs.

## License

Atelier DSM - All rights reserved
