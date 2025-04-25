import { FastifyInstance } from 'fastify';
import { build } from '../index';
import sql from '../database/connection';

describe('Auth Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    app = await build();
  });

  beforeEach(async () => {
    // Clean up the database before each test
    await sql`DELETE FROM refresh_tokens`;
    await sql`DELETE FROM users`;
  });

  afterAll(async () => {
    await app.close();
  });

  const testUser = {
    email: 'test@example.com',
    password: 'password123',
    firstName: 'John',
    lastName: 'Doe'
  };

  describe('POST /register', () => {
    it('should register a new user successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: testUser
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toHaveProperty('id');
    });

    it('should return 409 if email already exists', async () => {
      // First registration
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: testUser
      });

      // Second registration with same email
      const response = await app.inject({
        method: 'POST',
        url: '/register',
        payload: testUser
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toHaveProperty('error', 'Email already exists');
    });
  });

  describe('POST /login', () => {
    beforeEach(async () => {
      // Register a user before testing login
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: testUser
      });
    });

    it('should login successfully and return tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('accessToken');
      expect(response.json()).toHaveProperty('refreshToken');

      // Store tokens for later tests
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.json();
      accessToken = newAccessToken;
      refreshToken = newRefreshToken;
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: testUser.email,
          password: 'wrongpassword'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toHaveProperty('error', 'Invalid email or password');
    });
  });

  describe('POST /refresh', () => {
    beforeEach(async () => {
      // Register and login a user to get tokens
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: testUser
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { refreshToken: newRefreshToken } = loginResponse.json();
      refreshToken = newRefreshToken;
    });

    it('should refresh tokens successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('accessToken');
      expect(response.json()).toHaveProperty('refreshToken');
    });

    it('should return 401 for invalid refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken: 'invalid-token' }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toHaveProperty('error');
    });
  });

  describe('POST /logout', () => {
    beforeEach(async () => {
      // Register and login a user to get tokens
      await app.inject({
        method: 'POST',
        url: '/register',
        payload: testUser
      });

      const loginResponse = await app.inject({
        method: 'POST',
        url: '/login',
        payload: {
          email: testUser.email,
          password: testUser.password
        }
      });

      const { refreshToken: newRefreshToken } = loginResponse.json();
      refreshToken = newRefreshToken;
    });

    it('should logout successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/logout',
        headers: {
          Authorization: `Bearer ${refreshToken}`
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('message', 'Logged out successfully');
    });
  });
});