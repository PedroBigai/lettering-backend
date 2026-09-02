import type { Request, Response } from 'express';
import { confirmWordSchema, matchIdParamsSchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function postConfirmMatchWord(
  request: Request,
  response: Response,
): Promise<void> {
  const { matchId } = matchIdParamsSchema.parse(request.params);
  const input = confirmWordSchema.parse(request.body);
  const result = await getMatchModule(request).confirmMatchWord(
    response.locals.userId as string,
    matchId,
    input,
  );
  response.status(200).json(result);
}
