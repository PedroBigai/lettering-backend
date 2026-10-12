import type { Request, Response } from 'express';
import { matchIdParamsSchema, usePowerSchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function postUseMatchPower(request: Request, response: Response): Promise<void> {
  const { matchId } = matchIdParamsSchema.parse(request.params);
  const input = usePowerSchema.parse(request.body);
  const result = await getMatchModule(request).useMatchPower(
    response.locals.userId as string,
    matchId,
    input,
  );
  response.status(200).json(result);
}
