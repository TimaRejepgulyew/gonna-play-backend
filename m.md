# Gonna Play Backend

This is the backend for the Gonna Play application, built with Fastify, TypeScript, and JWT authentication.

## Features

- FastAPI with TypeScript
- JWT Authentication
- Request validation with TypeBox
- API documentation with Swagger
- Structured project architecture

## Getting Started

### Prerequisites

- Node.js (v16 or later)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/TimaRejepgulyew/gonna-play-backend.git
cd gonna-play-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
NODE_ENV=development
PORT=3000
HOST=localhost
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=24h
```

### Development

Start the development server with hot reloading:
```bash
npm run dev
```

### Build and Run for Production

Build the TypeScript project:
```bash
npm run build
```

Start the production server:
```bash
npm start
```

## API Endpoints

After starting the server, you can explore the API documentation at `http://localhost:3000/documentation`.

The API includes the following endpoints:

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Log in an existing user
- `GET /api/auth/me` - Get the current user's profile (protected)
- `GET /health` - Health check endpoint

## Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Request handlers
├── models/         # Data models
├── plugins/        # Fastify plugins
├── routes/         # Route definitions
├── services/       # Business logic
├── utils/          # Utility functions
└── index.ts        # Application entry point
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 