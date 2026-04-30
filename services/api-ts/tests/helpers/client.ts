/**
 * E2E Test Client
 * Simple API client that can be bound to a user for authenticated requests
 */

import { faker } from '@faker-js/faker';
import { createAuthClient } from 'better-auth/client';
import type { App } from '@/types/app';
import { generateUniqueEmail } from './unique';

type AuthClient = ReturnType<typeof createAuthClient>;

/**
 * Test API Client
 * - Starts as unauthenticated fetch wrapper
 * - Can be bound to a user via signup() or signin()
 * - Once bound, all requests automatically include auth
 */
export class ApiClient {
  private baseURL: string;
  private bearerToken?: string;
  private currentUser?: any;
  private authClient: AuthClient;
  private app?: App; // Embedded app instance for direct calls

  constructor(options: string | { apiBaseUrl?: string; app?: App } = {}) {
    // Handle string parameter as apiBaseUrl for backward compatibility
    if (typeof options === 'string') {
      options = { apiBaseUrl: options };
    }

    this.app = options.app;
    this.baseURL = options.apiBaseUrl || process.env.API_URL || 'http://localhost:7213';

    // Create auth client (will be wrapped for embedded apps in getAuthClient())
    this.authClient = createAuthClient({
      baseURL: this.baseURL,
      basePath: '/auth',
    });
  }



  /**
   * Core fetch method - handles JSON, query params, auth if bound
   * Routes to embedded app instance if available, otherwise makes HTTP request
   */
  async fetch(path: string, options: RequestInit & {
    searchParams?: Record<string, any>;
    body?: any;
  } = {}): Promise<Response> {
    // If we have an embedded app, call it directly
    if (this.app) {
      return this.fetchFromApp(path, options);
    }

    // Otherwise, make HTTP request (original behavior)
    return this.fetchFromHttp(path, options);
  }

  /**
   * Make request to embedded Hono app instance (no network call)
   */
  private async fetchFromApp(path: string, options: RequestInit & {
    searchParams?: Record<string, any>;
    body?: any;
  } = {}): Promise<Response> {
    // Build URL with query params for embedded app
    let url = path;
    if (options.searchParams) {
      const params = new URLSearchParams();
      Object.entries(options.searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += (path.includes('?') ? '&' : '?') + queryString;
      }
    }

    // Auto-handle JSON body
    let { body, headers = {}, searchParams, ...fetchOptions } = options;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    // Add auth if client is bound to a user
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    // Create Request object for Hono app
    const request = new Request(`http://localhost${url}`, {
      ...fetchOptions,
      headers,
      body,
    });

    // Call the embedded app directly
    return this.app!.fetch(request);
  }

  /**
   * Make HTTP request to external server (original behavior)
   */
  private async fetchFromHttp(path: string, options: RequestInit & {
    searchParams?: Record<string, any>;
    body?: any;
  } = {}): Promise<Response> {
    // Build URL with query params
    let url = `${this.baseURL}${path}`;
    if (options.searchParams) {
      const params = new URLSearchParams();
      Object.entries(options.searchParams).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += (path.includes('?') ? '&' : '?') + queryString;
      }
    }

    // Auto-handle JSON body
    let { body, headers = {}, searchParams, ...fetchOptions } = options;
    if (body && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }

    // Add auth if client is bound to a user
    if (this.bearerToken) {
      headers['Authorization'] = `Bearer ${this.bearerToken}`;
    }

    return fetch(url, {
      ...fetchOptions,
      headers,
      body,
    });
  }
  
  
  /**
   * Create a new user and bind this client to it
   * Returns the user object
   */
  async signup(options?: {
    email?: string;
    password?: string;
    name?: string;
  }): Promise<any> {
    const credentials = {
      email: options?.email || generateUniqueEmail(),
      password: options?.password || faker.internet.password({ length: 12, prefix: 'Aa1!' }),
      name: options?.name || faker.person.fullName(),
    };
    
    // Sign up (unauthenticated request)
    const signUpResponse = await this.fetch('/auth/sign-up/email', {
      method: 'POST',
      body: credentials,
    });
    
    if (!signUpResponse.ok) {
      const error = await signUpResponse.json();
      throw new Error(`Signup failed: ${error.message}`);
    }
    
    // Sign in and get token
    const signInResponse = await this.fetch('/auth/sign-in/email', {
      method: 'POST',
      body: { email: credentials.email, password: credentials.password },
    });
    
    if (!signInResponse.ok) {
      const error = await signInResponse.json();
      throw new Error(`Signin failed: ${error.message}`);
    }
    
    // Extract token and bind client
    this.bearerToken = signInResponse.headers.get('set-auth-token') || undefined;
    const data = await signInResponse.json();
    this.currentUser = data.user;
    
    return this.currentUser;
  }
  
  /**
   * Sign in as existing user and bind client
   * Returns the user object
   */
  async signin(email: string, password: string): Promise<any> {
    // Ensure password is never undefined
    if (!password) {
      throw new Error('Password is required for signin');
    }

    const response = await this.fetch('/auth/sign-in/email', {
      method: 'POST',
      body: {
        email: email || '',
        password: password || ''  // Ensure password is never undefined
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Signin failed: ${error.message}`);
    }

    this.bearerToken = response.headers.get('set-auth-token') || undefined;
    const data = await response.json();
    this.currentUser = data.user;

    return this.currentUser;
  }
  
  /**
   * Sign out (unbind from user)
   */
  signout() {
    this.bearerToken = undefined;
    this.currentUser = undefined;
  }

  /**
   * Get the current bearer token (for WebSocket auth, etc.)
   */
  getBearerToken(): string | undefined {
    return this.bearerToken;
  }
  
  /**
   * Get current user info (if bound)
   */
  getUser() {
    return this.currentUser;
  }
  
  /**
   * Get current token (if bound)
   */
  getToken() {
    return this.bearerToken;
  }
  
  /**
   * Check if client is authenticated
   */
  isAuthenticated() {
    return !!this.bearerToken;
  }
  
  /**
   * Get Better-Auth client for direct auth operations
   * Returns either the internal Better-Auth client or a wrapper for embedded apps
   */
  getAuthClient(): AuthClient {
    if (this.app) {
      // Return a wrapper that uses our embedded app for auth operations
      return this.createEmbeddedAuthClient();
    }
    return this.authClient;
  }

  /**
   * Create a wrapper auth client that routes to embedded app
   */
  private createEmbeddedAuthClient(): AuthClient {
    const self = this;

    const makeAuthRequest = async (endpoint: string, data?: any, method = 'POST') => {
      const response = await self.fetch(endpoint, {
        method,
        body: data
      });

      if (!response.ok) {
        let error;
        try {
          error = await response.json();
        } catch {
          error = { message: 'Server error', status: response.status };
        }
        return { data: null, error };
      }

      let result;
      try {
        result = await response.json();
      } catch {
        result = {};
      }
      return { data: result, error: null };
    };

    return {
      signUp: {
        email: (data: any) => makeAuthRequest('/auth/sign-up/email', data)
      },
      signIn: {
        email: (data: any) => makeAuthRequest('/auth/sign-in/email', data)
      },
      signOut: () => makeAuthRequest('/auth/sign-out'),
      getSession: () => makeAuthRequest('/auth/get-session', undefined, 'GET'),
      updateUser: (data: any) => makeAuthRequest('/auth/update-user', data),
      changeEmail: (data: any) => makeAuthRequest('/auth/change-email', data),
      changePassword: (data: any) => makeAuthRequest('/auth/change-password', data),
      deleteUser: (data: any) => makeAuthRequest('/auth/delete-user', data),
      sendVerificationEmail: (data: any) => makeAuthRequest('/auth/send-verification-email', data),
      verifyEmail: (data: any) => makeAuthRequest('/auth/verify-email', data),
      sendPasswordResetEmail: (data: any) => makeAuthRequest('/auth/send-password-reset-email', data),
      forgetPassword: (data: any) => makeAuthRequest('/auth/forget-password', data),
      resetPassword: (data: any) => makeAuthRequest('/auth/reset-password', data),
      emailOtp: {
        sendVerificationOtp: (data: any) => makeAuthRequest('/auth/email-otp/send-verification-otp', data),
        verifyEmail: (data: any) => makeAuthRequest('/auth/email-otp/verify-email', data),
        checkVerificationOtp: (data: any) => makeAuthRequest('/auth/email-otp/check-verification-otp', data),
        resetPassword: (data: any) => makeAuthRequest('/auth/email-otp/reset-password', data)
      }
    } as AuthClient;
  }
  
  /**
   * Create a patient profile for the current user
   * Returns the created patient profile
   */
  async createPatientProfile(patientData?: any): Promise<any> {
    if (!this.isAuthenticated()) {
      throw new Error('Must be authenticated to create patient profile');
    }
    
    const response = await this.fetch('/patients', {
      method: 'POST',
      body: patientData || {}
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to create patient profile: ${error.message}`);
    }
    
    return response.json();
  }
  
  /**
   * Create a provider profile for the current user
   * Returns the created provider profile (or existing one if already exists)
   */
  async createProviderProfile(providerData: any): Promise<any> {
    if (!this.isAuthenticated()) {
      throw new Error('Must be authenticated to create provider profile');
    }

    // Try to create new provider profile
    const response = await this.fetch('/providers', {
      method: 'POST',
      body: providerData
    });

    if (response.ok) {
      // Successfully created new provider profile
      return response.json();
    }

    // Check if error is because provider already exists
    const error = await response.json();
    if (error.code === 'PROVIDER_EXISTS' || error.message?.includes('already exists')) {
      // Provider already exists for this person
      // For tests, this should be treated as a failure since each test should create its own unique provider
      // The test suite should be designed to avoid this conflict
      console.warn('Provider already exists for user - tests should create unique providers', {
        userId: this.currentUser?.id,
        errorCode: error.code,
        errorMessage: error.message
      });

      // Throw an error to signal test design issue
      throw new Error(`Provider already exists for this user. Each test should create its own unique provider client to avoid conflicts.`);
    }

    // Some other error occurred
    throw new Error(`Failed to create provider profile: ${error.message}`);
  }
  
  /**
   * Sign in as one of the pre-configured admin users
   * Uses the admin email from .env AUTH_ADMIN_EMAILS configuration
   * Creates a clean admin user if sign-in fails
   */
  async signinAsAdmin(): Promise<any> {
    // Use the first admin email from .env configuration
    // AUTH_ADMIN_EMAILS=admin1@test.com,admin2@test.com,admin3@test.com
    const adminEmail = 'admin1@test.com';
    // Use a strong, unique password that won't be in compromised databases
    const adminPassword = 'UnitTestAdminSecure2024!#$';

    try {
      // First try to sign in with existing admin account
      return await this.signin(adminEmail, adminPassword);
    } catch (signinError: any) {
      // If signin fails, try creating the admin user via signup
      console.log(`Admin signin failed (${signinError.message}), creating fresh admin user...`);

      try {
        const signUpResponse = await this.fetch('/auth/sign-up/email', {
          method: 'POST',
          body: {
            email: adminEmail,
            password: adminPassword,
            name: 'Test Admin'
          }
        });

        if (signUpResponse.ok) {
          return await this.signin(adminEmail, adminPassword);
        } else {
          const errorData = await signUpResponse.json();
          if (errorData.message?.includes('User already exists')) {
            // User exists but wrong password - throw helpful error
            throw new Error(`Admin user ${adminEmail} exists but password is incorrect. You may need to reset the user in the database.`);
          }
          throw new Error(`Signup failed: ${errorData.message || 'Unknown error'}`);
        }
      } catch (signupError: any) {
        throw new Error(`Failed to create admin user. Signin error: ${signinError.message}. Signup error: ${signupError.message}`);
      }
    }
  }
  
}

// Factory function if you prefer functional style
export function createApiClient(options?: string | { apiBaseUrl?: string; app?: App }) {
  return new ApiClient(options);
}
