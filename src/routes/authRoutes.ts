import { Router } from 'express';
import { createAuthController } from '../controllers/authController';
import { authenticate } from '../middlewares/authenticate';
import type { AuthService } from '../modules/authService';

export function createAuthRouter(authService: AuthService) {
  const router = Router();
  const controller = createAuthController(authService);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.get('/me', authenticate(authService), controller.me);

  return router;
}

