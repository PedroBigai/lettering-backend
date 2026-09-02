import type { Request, Response } from 'express';
import { matchIdParamsSchema, placePieceSchema } from '../schemas/matchSchemas';
import { getMatchModule } from '../server/getModule';

export async function postMatchPiece(
  request: Request,
  response: Response,
): Promise<void> {
  const { matchId } = matchIdParamsSchema.parse(request.params);
  const input = placePieceSchema.parse(request.body);
  const result = await getMatchModule(request).placeMatchPiece(
    response.locals.userId as string,
    matchId,
    input,
  );
  response.status(200).json(result);
}
