import type { Request, Response } from 'express';
import { matchIdParamsSchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function postPauseMatch(request: Request, response: Response): Promise<void> {
  const { matchId } = matchIdParamsSchema.parse(request.params);
  const result = await getMatchModule(request).pauseMatch(
    response.locals.userId as string,
    matchId,
  );
  response.status(200).json(result);
}
