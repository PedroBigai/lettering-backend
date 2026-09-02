import type { Request, Response } from 'express';
import { registerSchema } from '../schemas/authSchemas';
import { getAuthModule } from '../server/getModule';

export async function postRegisterUser(request: Request, response: Response): Promise<void> {
  const input = registerSchema.parse(request.body);
  const result = await getAuthModule(request).registerUser(input);
  response.status(201).json(result);
}
