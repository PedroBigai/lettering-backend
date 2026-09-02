import type { Request, Response } from 'express';
import { createMatchSchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function postMatch(request: Request, response: Response): Promise<void> {
  const input = createMatchSchema.parse(request.body ?? {});
  const result = await getMatchModule(request).createMatch(
    response.locals.userId as string,
    input,
  );
  response.status(201).json(result);
}
