import type { Request, Response } from 'express';
import { rankingQuerySchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function getRanking(request: Request, response: Response): Promise<void> {
  const query = rankingQuerySchema.parse(request.query);
  const result = await getMatchModule(request).getRanking(
    response.locals.userId as string,
    query,
  );
  response.status(200).json(result);
}
