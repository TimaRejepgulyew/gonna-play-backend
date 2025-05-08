// src/controllers/auth.controller.ts

import { FastifyRequest, FastifyReply } from "fastify";
import { TokenPayload } from "../services/auth.service";

interface LoginRequestBody {
  username: string;
  password: string;
}

interface RefreshRequestBody {
  refreshToken: string;
}

// This is a placeholder. You'll need to implement actual user authentication logic.
const authenticateUser = async (username: string, password: string) => {
  // In a real application, you would look up the user in your database
  // and validate the password.
  // For this example, we'll just return a dummy user ID.
  if (username === "test" && password === "password") {
    return { id: "user123" };
  }
  return null;
};

export const login = async (
  req: FastifyRequest<{ Body: LoginRequestBody }>,
  res: FastifyReply
): Promise<void> => {
  const { username, password } = req.body;

  // Authenticate user (replace with your actual authentication logic)
  const user = await authenticateUser(username, password);

  if (!user) {
    res.status(401).send({ message: "Invalid credentials" });
    return;
  }

  const payload: TokenPayload = { userId: user.id };
  
  // Use Fastify JWT to sign the token
  const accessToken = res.jwt.sign(payload, { expiresIn: '15m' });
  const refreshToken = res.jwt.sign(payload, { expiresIn: '7d' });

  // In a real application, you should store the refresh token securely
  // in your database associated with the user.

  res.status(200).send({ accessToken, refreshToken });
};

export const register = async (
  _: FastifyRequest,
  res: FastifyReply
): Promise<void> => {
  // Implement user registration logic here.
  // After successful registration, you might want to automatically log them in
  // and return tokens.
  res.status(501).send({ message: "Registration not implemented yet" });
};

export const refresh = async (
  req: FastifyRequest<{ Body: RefreshRequestBody }>,
  res: FastifyReply
): Promise<void> => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(401).send({ message: "Refresh token not provided" });
    return;
  }

  try {
    // Verify the refresh token
    const decoded = res.jwt.verify<TokenPayload>(refreshToken);
    
    // Generate new tokens
    const payload: TokenPayload = { userId: decoded.userId };
    const newAccessToken = res.jwt.sign(payload, { expiresIn: '15m' });
    const newRefreshToken = res.jwt.sign(payload, { expiresIn: '7d' });

    // In a real application, you should validate and update the refresh token in your database

    res.status(200).send({ 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken 
    });
  } catch (error) {
    res.status(403).send({ message: "Invalid refresh token" });
  }
};
