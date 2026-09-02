import type { Request, Response } from 'express';
import { loginSchema } from '../schemas/authSchemas';
import { getAuthModule } from '../server/getModule';

export async function postAuth(request: Request, response: Response): Promise<void> {
  const input = loginSchema.parse(request.body);
  const result = await getAuthModule(request).loginUser(input);
  response.status(200).json(result);
}
