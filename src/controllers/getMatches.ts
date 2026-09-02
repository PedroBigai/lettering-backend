import type { Request, Response } from 'express';
import { matchHistoryQuerySchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function getMatches(request: Request, response: Response): Promise<void> {
  const query = matchHistoryQuerySchema.parse(request.query);
  const result = await getMatchModule(request).getMatches(
    response.locals.userId as string,
    query,
  );
  response.status(200).json(result);
}
