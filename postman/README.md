# Gonna Play API Postman Collection

This directory contains Postman collections and environments for testing the Gonna Play API.

## Collection Structure

The collection is organized into folders for each major API area:

- **Authentication**: Register, login, and get current user
- **Users**: User profile management
- **Locations**: Location CRUD operations
- **Games**: Game CRUD operations

## Environments

Multiple environments are provided to test against different deployments:

- **Local**: For testing against a locally running server (`http://localhost:3000`)
- **Docker**: For testing against the Docker containerized version (`http://localhost:3000`)
- **Staging**: For testing against the staging environment
- **Production**: For testing against the production environment

## Variables

The following variables are used across the collection:

- `baseUrl`: The base URL for the API
- `authToken`: JWT token obtained after login
- `userId`: ID of the current user
- `locationId`: ID of a created location
- `gameId`: ID of a created game

## Automatic Variable Setting

The collection includes scripts that automatically set variables:

1. The **Login** request automatically sets the `authToken` variable
2. The **Create Location** request automatically sets the `locationId` variable
3. The **Create Game** request automatically sets the `gameId` variable

## Running the Collection

### Using Postman UI

1. Import the collection and environment files into Postman
2. Select the appropriate environment from the dropdown
3. Run the collection or individual requests

### Using Newman (Command Line)

Run the entire collection with a specific environment:

```bash
npm run test:api:local   # Test against local environment
npm run test:api:docker  # Test against Docker environment
npm run test:api:staging # Test against staging environment
npm run test:api:prod    # Test against production environment
```

Or use the default (Docker) environment:

```bash
npm run test:api
```

## Reports

When running tests via Newman, HTML reports are generated in the `reports` directory.

## Best Practices

1. Always run the authentication requests first to get a valid token
2. Create test data (locations, games) before testing operations on them
3. Clean up test data after testing by using the delete endpoints 