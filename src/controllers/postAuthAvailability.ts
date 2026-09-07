import type { Request, Response } from 'express';
import { availabilitySchema } from '../schemas/authSchemas';
import { getAuthModule } from '../server/getModule';

export async function postAuthAvailability(
  request: Request,
  response: Response,
): Promise<void> {
  const input = availabilitySchema.parse(request.body);
  const result = await getAuthModule(request).checkAvailability(input);
  response.status(200).json(result);
}
