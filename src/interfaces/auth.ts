import type { z } from 'zod';
import type { loginSchema, registerSchema } from '../schemas/authSchemas';

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
}

export interface AuthenticationResult {
  user: PublicUser;
  token: string;
}

export interface AuthModuleOptions {
  jwtSecret: string;
  jwtExpiresInSeconds: number;
}
