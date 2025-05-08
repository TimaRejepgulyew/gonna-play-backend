# Auth Service

Authentication service built with Fastify and TypeScript.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=3000
   HOST=0.0.0.0
   NODE_ENV=development
   JWT_SECRET=your_secret_key
   JWT_EXPIRES_IN=1d
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8000
   ```

## Development

To run the service in development mode:

```bash
npm run dev
```

This will start the server with hot-reloading enabled.

## Building for Production

To build the service for production:

```bash
npm run build
```

This will:
1. Clean the `dist` directory
2. Compile TypeScript files
3. Generate type definitions
4. Setup proper path alias resolution

## Running in Production

To run the compiled service:

```bash
npm start
```

## Project Structure

```
src/
├── config/       # Configuration files
├── controllers/  # Route controllers
├── middleware/   # Middleware functions
├── models/       # Data models
├── routes/       # Route definitions
├── services/     # Business logic
├── app.ts        # Fastify app setup
├── index.ts      # Main entry point
└── module-resolver.ts # Path alias resolution
```

## Build Configuration

The build process leverages TypeScript's compiler with the following features:
- Path aliases (`@/*` resolves to `src/*`)
- Source maps for debugging
- Type declaration generation
- ES2022 target with CommonJS modules

The production build uses `module-alias` to ensure path aliases work correctly after compilation.

## Features

- User registration and login
- JWT-based authentication
- Refresh token mechanism
- Password hashing with Argon2
- PostgreSQL database
- API documentation with Swagger
- TypeScript support
- Input validation with Zod
- CORS support

## Prerequisites

- Node.js (v18 or higher)
- Docker and Docker Compose
- PostgreSQL (via Docker)

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user
- `