import type { Request, Response } from 'express';
import { getAuthModule } from '../server/getModule';

export async function getMe(
  request: Request,
  response: Response,
): Promise<void> {
  const user = await getAuthModule(request).getAuthenticatedUser(
    response.locals.userId as string,
  );
  response.status(200).json({ user });
}
