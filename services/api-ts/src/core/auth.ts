/**
 * Better-Auth configuration for Monobase Application Platform
 * Simplified version for basic authentication
 */

import { randomUUID } from 'crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP, openAPI, admin, bearer, twoFactor, magicLink, apiKey, lastLoginMethod } from 'better-auth/plugins';
import { oneTimeToken } from "better-auth/plugins/one-time-token";
import { passkey } from 'better-auth/plugins/passkey'
import type { App } from '@/types/app';
import type { DatabaseInstance } from '@/core/database';
import type { Logger } from '@/types/logger';
import type { EmailService } from '@/core/email';
import type { AuthInstance } from '@/utils/auth';
import { EmailTemplateTags } from '@/handlers/email/repos/email.schema';
import * as schema from '@/generated/better-auth/schema';
import { createTrustedOriginsList, determineCookieConfig } from '@/utils/cors';
import { ac } from '@/utils/auth';
import type { Config } from '@/core/config';

// Re-export auth instance type for type safety
// AuthInstance type re-exported for convenience
export type { AuthInstance };

/**
 * Create and configure Better-Auth instance
 * @param database - Drizzle database instance
 * @param config - Full application configuration
 * @param logger - Optional logger instance for plugin logging
 * @param emailService - Email service instance for authentication emails
 */
export function createAuth(database: DatabaseInstance, config: Config, logger: Logger | undefined, emailService: EmailService): AuthInstance {
  // Generate trusted origins and cookie config based on CORS settings
  const trustedOrigins = createTrustedOriginsList(config.cors);
  const cookieConfig = determineCookieConfig(config.cors, config.auth);
  return betterAuth({
    // Basic configuration
    appName: 'Monobase',
    baseURL: config.auth.baseUrl,
    basePath: '/auth',
    secret: config.auth.secret,
    trustedOrigins: trustedOrigins,

    // Database configuration
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema,
    }),
    
    // Email configuration
    emailVerification: {
      sendVerificationEmail: async ({ user, token, url }) => {
        try {
          await emailService.queueEmail({
            templateTags: [EmailTemplateTags.AUTH_EMAIL_VERIFY],
            recipient: user.email,
            variables: {
              name: user.name || 'User',
              email: user.email,
              verificationLink: url,
              verificationToken: token
            },
            priority: 1 // High priority for auth emails
          });
          logger?.info({ userId: user.id, email: user.email }, 'Email verification queued');
        } catch (error) {
          logger?.error({ error, userId: user.id, email: user.email }, 'Failed to queue email verification');
          // Continue auth flow even if email fails (non-blocking)
        }
      },
      sendOnSignUp: true,
    },
    
    // Email and password authentication
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false, // Disabled for testing
      minPasswordLength: 8,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url, token }) => {
        try {
          await emailService.queueEmail({
            templateTags: [EmailTemplateTags.AUTH_PASSWORD_RESET],
            recipient: user.email,
            variables: {
              name: user.name || 'User',
              email: user.email,
              resetLink: url,
              resetToken: token,
              expirationTime: 15 // Link expires in 15 minutes (template default)
            },
            priority: 1 // High priority for auth emails
          });
          logger?.info({ userId: user.id, email: user.email }, 'Password reset email sent');
        } catch (error) {
          logger?.error({ error, userId: user.id, email: user.email }, 'Failed to send password reset email');
          // Continue auth flow even if email fails (non-blocking)
        }
      },
    },
    
    // Social providers (optional)
    socialProviders: config.auth.socialProviders ? {
      google: config.auth.socialProviders.google ? {
        clientId: config.auth.socialProviders.google.clientId,
        clientSecret: config.auth.socialProviders.google.clientSecret,
      } : undefined,
    } : undefined,
    
    // Database hooks for user lifecycle management
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Check if user email is in admin list
            const adminEmails = config.auth.adminEmails || [];
            if (!adminEmails.includes(user.email)) {
              return { data: user }; // No modification needed
            }

            // Modify role data before it gets stored
            const currentRole = user['role'] || 'user';
            const existingRoles = typeof currentRole === 'string' 
              ? currentRole.split(',').map((r: string) => r.trim()).filter(r => r)
              : [];

            if (!existingRoles.includes('admin')) {
              existingRoles.push('admin');
              const newRole = existingRoles.join(',');

              if (logger) {
                logger.info(`Auto-promoting new user ${user.email} to admin role during creation`);
              }

              // Return wrapped in data object - Better-Auth requirement
              return {
                data: {
                  ...user,
                  role: newRole
                }
              };
            }

            return { data: user }; // Return unchanged if already admin
          }
        }
      }
    },

    // Extension plugins
    plugins: [
      emailOTP({
        sendVerificationOTP: async ({ email, otp, type }) => {
          try {
            await emailService.queueEmail({
              templateTags: [EmailTemplateTags.AUTH_2FA],
              recipient: email,
              variables: {
                name: 'User', // OTP emails may not have user context, use generic name
                email,
                code: otp, // Template expects 'code', not 'otp'
                expirationTime: 5, // Code expires in 5 minutes (template default)
                type, // type of email: sign-in | email-verification | password-reset
              },
              priority: 1 // High priority for auth emails
            });
            logger?.info({ email, type }, 'OTP verification email sent');
          } catch (error) {
            logger?.error({ error, email, type }, 'Failed to send OTP verification email');
            // Continue auth flow even if email fails (non-blocking)
          }
        },
      }),
      admin({
        defaultRole: 'user',
        adminRoles: ['admin'],
        ac,
      }),
      bearer(),
      passkey(),
      twoFactor(),
      magicLink({
        sendMagicLink: async ({ email, url, token }) => {
          try {
            await emailService.queueEmail({
              templateTags: [EmailTemplateTags.AUTH_MAGIC_LINK],
              recipient: email,
              variables: {
                name: 'User',  // Magic link doesn't have user context
                email,
                magicLink: url,
                token,
              },
              priority: 1 // High priority for auth emails
            });
            logger?.info({ email }, 'Email change verification sent');
          } catch (error) {
            logger?.error({ error, email }, 'Failed to send email magic link');
            // Continue auth flow even if email fails (non-blocking)
          }
        },
      }),
      apiKey(),
      lastLoginMethod(),
      oneTimeToken(),
      openAPI(),
    ],
    
    // User schema extensions - simplified
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailVerification: async ({ user, newEmail, url, token }) => {
          try {
            await emailService.queueEmail({
              templateTags: [EmailTemplateTags.AUTH_EMAIL_VERIFY],
              recipient: newEmail,
              variables: {
                name: user.name || 'User',
                email: newEmail,
                currentEmail: user.email,
                verificationLink: url,
                verificationToken: token
              },
              priority: 1 // High priority for auth emails
            });
            logger?.info({ userId: user.id, currentEmail: user.email, newEmail }, 'Email change verification sent');
          } catch (error) {
            logger?.error({ error, userId: user.id, currentEmail: user.email, newEmail }, 'Failed to send email change verification');
            // Continue auth flow even if email fails (non-blocking)
          }
        },
      },
      deleteUser: {
        enabled: true,
      },
    },
    
    // Session configuration
    session: {
      expiresIn: config.auth.sessionExpiresIn,
      storeSessionInDatabase: true, // Enabled for better security and scalability
      cleanupAfter: '7d', // Clean up expired sessions after 7 days
    },

    // Account linking
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
      },
    },


    // Rate limiting
    rateLimit: {
      enabled: config.auth.rateLimitEnabled,
      window: config.auth.rateLimitWindow,
      max: config.auth.rateLimitMax,
    },
    
    // Advanced options
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-client-ip", "x-forwarded-for"],
      },
      defaultCookieAttributes: {
        secure: cookieConfig.secure,
        httpOnly: true,
        sameSite: cookieConfig.sameSite,
      },
      database: {
        generateId: () => {
          // Generate a proper UUID v4 for Better-Auth IDs
          return randomUUID();
        },
      },
    },

    // Logger options
    logger: {
      log: (level, message, ...args) => {
        // Use the pino logger if available
        if (logger) {
          const logFn = logger[level as keyof typeof logger];
          if (typeof logFn === 'function') {
            (logFn as any).call(logger, message, ...args);
          }
        }
      },
    },
  });
}


/**
 * Register auth routes with the Hono app
 * Better-Auth handles all authentication endpoints
 */
export function registerRoutes(app: App): void {
  const { auth } = app;

  // Better-Auth handles all /auth/* routes with all HTTP methods
  app.all("/auth/*", (c) => auth.handler(c.req.raw));
}
