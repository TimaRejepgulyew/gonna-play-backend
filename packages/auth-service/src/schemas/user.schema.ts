import { z } from 'zod';

export const registerUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    firstName: z.string().min(2, 'First name must be at least 2 characters').optional(),
    lastName: z.string().min(2, 'Last name must be at least 2 characters').optional(),
  }),
});

export const loginUserSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string(),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string(),
  }),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>['body'];
export type LoginUserInput = z.infer<typeof loginUserSchema>['body'];
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>['body']; 