import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type {
  AuthenticationResult,
  AuthModuleOptions,
  LoginInput,
  PublicUser,
  RegisterInput,
} from '../interfaces/auth';
import type { UserRecord, UserRepository } from '../interfaces/user';
import { DuplicateUserError } from './repositories/userRepository';
import { ApiError } from '../server/errors';

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export class AuthModule {
  constructor(
    private readonly users: UserRepository,
    private readonly options: AuthModuleOptions,
  ) {}

  async registerUser(input: RegisterInput): Promise<AuthenticationResult> {
    const [emailUser, usernameUser] = await Promise.all([
      this.users.findByEmail(input.email),
      this.users.findByUsername(input.username),
    ]);

    if (emailUser) {
      throw new ApiError(409, 'EMAIL_ALREADY_IN_USE', 'Email is already in use');
    }
    if (usernameUser) {
      throw new ApiError(409, 'USERNAME_ALREADY_IN_USE', 'Username is already in use');
    }

    let user: UserRecord;
    try {
      user = await this.users.create({
        id: randomUUID(),
        username: input.username,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 12),
      });
    } catch (error) {
      if (error instanceof DuplicateUserError) {
        throw new ApiError(409, 'USER_ALREADY_EXISTS', 'Email or username is already in use');
      }
      throw error;
    }

    return { user: publicUser(user), token: this.createAuthToken(user.id) };
  }

  async loginUser(input: LoginInput): Promise<AuthenticationResult> {
    const user = await this.users.findByEmail(input.email);
    const passwordMatches = user
      ? await bcrypt.compare(input.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    return { user: publicUser(user), token: this.createAuthToken(user.id) };
  }

  async getAuthenticatedUser(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new ApiError(401, 'INVALID_TOKEN', 'Invalid authentication token');
    return publicUser(user);
  }

  verifyAuthToken(token: string): string {
    try {
      const payload = jwt.verify(token, this.options.jwtSecret, {
        issuer: 'lettering-api',
        audience: 'lettering-web',
      });

      if (typeof payload === 'string' || !this.hasSubject(payload)) {
        throw new Error('JWT subject is missing');
      }
      return payload.sub;
    } catch {
      throw new ApiError(401, 'INVALID_TOKEN', 'Invalid or expired authentication token');
    }
  }

  private createAuthToken(userId: string): string {
    return jwt.sign({}, this.options.jwtSecret, {
      subject: userId,
      expiresIn: this.options.jwtExpiresInSeconds,
      issuer: 'lettering-api',
      audience: 'lettering-web',
    });
  }

  private hasSubject(payload: JwtPayload): payload is JwtPayload & { sub: string } {
    return typeof payload.sub === 'string' && payload.sub.length > 0;
  }
}
