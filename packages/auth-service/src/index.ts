// src/index.ts
// Main entry point for the auth service

// Register path aliases for production build
import './module-resolver';

// Import app and start server
import { app, startServer } from './app';

// Start the server
startServer();

// Export for external usage
export { app }; 