# Football Game Backend

A backend service for a football game mobile application that allows users to create and join football games.

## Features

- User authentication and authorization with JWT
- Create, update, and join football games
- Location management for game venues
- Participant management
- Game ratings and feedback

## Tech Stack

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Docker

## Prerequisites

- Node.js (v16+)
- Docker and Docker Compose
- npm or yarn

## Getting Started

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Environment Variables

Copy the example environment file and update the values:

```bash
cp .env.example .env
```

### Running with Docker

Start the application, database, and SonarQube with a single command:

```bash
npm run docker:start
```

This script will:
1. Start all Docker containers defined in docker-compose.yml
2. Wait for PostgreSQL to be ready
3. Run database migrations automatically
4. Display information about running services

To stop all containers:

```bash
npm run docker:stop
```

To restart all containers:

```bash
npm run docker:restart
```

### Running Locally (Without Docker)

1. Start the PostgreSQL database:

```bash
docker-compose up postgres
```

2. Run migrations:

```bash
npm run migrate
```

3. Start the development server:

```bash
npm run start:dev
```

## Development

### Code Style and Linting

Format code:

```bash
npm run format
```

Lint code:

```bash
npm run lint
```

Check and fix code:

```bash
npm run check
```

### Testing

Run tests:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## API Documentation

Once the server is running, you can access the Swagger documentation at:

```
http://localhost:3000/documentation
```

### Postman Collection

A comprehensive Postman collection is available for testing the API:

1. Import the collection from `postman/gonna-play-api.postman_collection.json`
2. Import an environment from `postman/environments/`
3. Use the collection to test all API endpoints

Run API tests from the command line:

```bash
# Run against Docker environment (default)
npm run test:api

# Run against specific environment
npm run test:api:local
npm run test:api:docker
npm run test:api:staging
npm run test:api:prod
```

See `postman/README.md` for more details on using the Postman collection.

## Database Migrations

Run existing migrations:

```bash
npm run migrate
```

Create a new migration:

```bash
npm run migrate:create your_migration_name
```

This will create a timestamped SQL migration file in the `src/migrations` directory. Edit this file to add your SQL commands, then run the migration.

## Building for Production

Build the application:

```bash
npm run build
```

Start the production server:

```bash
npm run start:prod
```

## Code Quality

### SonarQube Analysis

This project is configured to use SonarQube for code quality analysis.

#### Running SonarQube Locally

1. Make sure Docker and Docker Compose are installed
2. Run the SonarQube setup script:
   ```
   ./scripts/run-sonar.sh
   ```
3. Access SonarQube at http://localhost:9000 (default credentials: admin/admin)
4. Create a token in SonarQube (Administration > Security > Users > Tokens)
5. Run the analysis:
   ```
   SONAR_TOKEN=your_token npm run sonar:coverage
   ```

#### CI/CD Integration

SonarQube analysis runs automatically on GitHub Actions for all pushes to main and develop branches, as well as for pull requests.

## Deployment

The application can be deployed using Docker:

```
docker-compose up -d
```