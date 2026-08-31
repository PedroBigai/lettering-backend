import type { RequestHandler } from 'express';
import type { AuthService } from '../modules/authService';
import { loginSchema, registerSchema } from '../schemas/authSchemas';

export type AuthController = {
  register: RequestHandler;
  login: RequestHandler;
  me: RequestHandler;
};

export function createAuthController(authService: AuthService): AuthController {
  return {
    register: async (request, response) => {
      const input = registerSchema.parse(request.body);
      const result = await authService.register(input);
      response.status(201).json(result);
    },

    login: async (request, response) => {
      const input = loginSchema.parse(request.body);
      const result = await authService.login(input);
      response.status(200).json(result);
    },

    me: async (_request, response) => {
      const user = await authService.getUser(response.locals.userId as string);
      response.status(200).json({ user });
    },
  };
}

