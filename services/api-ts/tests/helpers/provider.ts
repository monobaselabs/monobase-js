/**
 * Provider E2E Test Helper Functions
 * Provides utilities for testing provider-related endpoints
 */

import { faker } from '@faker-js/faker';
import type { ApiClient } from './client';
import { 
  generateTestPersonData, 
  type PersonCreateRequest 
} from './person';
import type { paths } from '@monobase/api-spec';

// Export types from the OpenAPI spec for easy access
export type Provider = paths['/providers/{provider}']['get']['responses']['200']['content']['application/json'];
export type ProviderCreateRequest = paths['/providers']['post']['requestBody']['content']['application/json'];
export type ProviderUpdateRequest = paths['/providers/{provider}']['patch']['requestBody']['content']['application/json'];
export type ListProvidersResponse = paths['/providers']['get']['responses']['200']['content']['application/json'];

// Re-export nested types for backward compatibility
export type ProviderResponse = Provider;
export type ProviderType = Provider['providerType'];

/**
 * Common minor ailment specialties
 */
const MINOR_AILMENT_SPECIALTIES = [
  'Allergies and hay fever',
  'Cold sores',
  'Conjunctivitis (pink eye)',
  'Dermatitis and eczema',
  'Hemorrhoids',
  'Impetigo',
  'Insect bites and stings',
  'Itching, burning, irritated eyes',
  'Minor acne',
  'Minor cuts and scrapes',
  'Minor pain and fever',
  'Minor sleep disorders',
  'Oral thrush',
  'Pinworms and threadworms',
  'Sprains and strains',
  'Urinary tract infections',
  'Warts'
];

/**
 * Common practice locations for minor ailments
 */
const PRACTICE_LOCATIONS = [
  'Community pharmacy',
  'Walk-in clinic',
  'Family practice',
  'Urgent care center',
  'Retail health clinic',
  'Telehealth platform',
  'Mobile clinic'
];

/**
 * Generate realistic test provider data using faker
 */
export function generateTestProviderData(overrides: Partial<ProviderCreateRequest> = {}): ProviderCreateRequest {
  const personData = generateTestPersonData();
  const providerTypes: ProviderType[] = [
    'pharmacist', 'other'
  ];
  
  return {
    person: personData,
    providerType: faker.helpers.arrayElement(providerTypes),
    yearsOfExperience: faker.number.int({ min: 1, max: 40 }),
    biography: faker.lorem.paragraphs(2, '\n\n'),
    minorAilmentsSpecialties: faker.helpers.arrayElements(MINOR_AILMENT_SPECIALTIES, { min: 2, max: 6 }),
    minorAilmentsPracticeLocations: faker.helpers.arrayElements(PRACTICE_LOCATIONS, { min: 1, max: 3 }),
    ...overrides
  };
}

/**
 * Generate minimal provider data for testing required fields
 */
export function generateMinimalProviderData(): ProviderCreateRequest {
  return {
    person: {
      firstName: faker.person.firstName()
    },
    providerType: 'pharmacist'
  };
}

/**
 * Generate invalid provider data for validation testing
 */
export function generateInvalidProviderData(): Record<string, any> {
  return {
    person: {
      firstName: '' // Empty required field
    },
    providerType: 'invalid-type', // Invalid provider type
    yearsOfExperience: -5, // Negative years
    minorAilmentsSpecialties: 'not-an-array', // Should be array
    minorAilmentsPracticeLocations: 'not-an-array' // Should be array
  };
}

/**
 * Create a provider via API
 */
export async function createProvider(
  apiClient: ApiClient,
  data: ProviderCreateRequest
): Promise<{ response: Response; data?: ProviderResponse }> {
  const response = await apiClient.fetch('/providers', {
    method: 'POST',
    body: data  // No JSON.stringify needed!
  });

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Get a provider by ID
 */
export async function getProvider(
  apiClient: ApiClient,
  providerId: string
): Promise<{ response: Response; data?: ProviderResponse }> {
  const response = await apiClient.fetch(`/providers/${providerId}`);

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Get current user's provider profile via /providers/me
 */
export async function getMyProvider(
  apiClient: ApiClient,
  params?: { expand?: string[] }
): Promise<{ response: Response; data?: ProviderResponse }> {
  const response = await apiClient.fetch('/providers/me', {
    searchParams: params
  });

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Update a provider
 */
export async function updateProvider(
  apiClient: ApiClient,
  providerId: string,
  data: ProviderUpdateRequest
): Promise<{ response: Response; data?: ProviderResponse }> {
  const response = await apiClient.fetch(`/providers/${providerId}`, {
    method: 'PATCH',
    body: data  // No JSON.stringify needed!
  });

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Delete a provider
 */
export async function deleteProvider(
  apiClient: ApiClient,
  providerId: string
): Promise<{ response: Response }> {
  const response = await apiClient.fetch(`/providers/${providerId}`, {
    method: 'DELETE'
  });

  return { response };
}

/**
 * List providers with optional filters
 */
export async function listProviders(
  apiClient: ApiClient,
  params: {
    limit?: number;
    offset?: number;
    q?: string;
    specialty?: string;
    location?: string;
    isVerified?: boolean;
  } = {}
): Promise<{ response: Response; data?: ListProvidersResponse }> {
  const response = await apiClient.fetch('/providers', {
    searchParams: params  // Clean query param handling!
  });

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}


/**
 * Wait for provider to be available (useful after creation)
 */
export async function waitForProvider(
  apiClient: ApiClient,
  providerId: string,
  maxRetries = 5
): Promise<ProviderResponse | null> {
  for (let i = 0; i < maxRetries; i++) {
    const { response, data } = await getProvider(apiClient, providerId);
    if (response.ok && data) {
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

/**
 * Generate test data for bulk operations
 */
export function generateBulkProviderData(count: number): ProviderCreateRequest[] {
  return Array.from({ length: count }, () => generateTestProviderData());
}

/**
 * Validate provider response structure
 */
export function validateProviderResponse(provider: any): provider is ProviderResponse {
  return (
    typeof provider === 'object' &&
    typeof provider.id === 'string' &&
    (typeof provider.person === 'string' || typeof provider.person === 'object') && // UUID reference or person object
    typeof provider.providerType === 'string' &&
    typeof provider.createdAt === 'string' &&
    typeof provider.updatedAt === 'string'
  );
}

/**
 * Generate provider search scenarios
 */
export function generateProviderSearchScenarios(): Array<{
  description: string;
  params: Parameters<typeof listProviders>[0];
}> {
  return [
    {
      description: 'Pharmacists with experience',
      params: { providerType: 'pharmacist', minExperience: 5 }
    },
    {
      description: 'Other healthcare providers',
      params: { providerType: 'other' }
    },
    {
      description: 'Pharmacists specializing in allergies',
      params: { providerType: 'pharmacist', specialty: 'Allergies and hay fever' }
    }
  ];
}

/**
 * Generate different provider type scenarios
 */
export function generateProviderTypeScenarios(): Array<{
  providerType: ProviderType;
  expectedSpecialties: string[];
}> {
  return [
    {
      providerType: 'pharmacist',
      expectedSpecialties: [
        'Allergies and hay fever',
        'Cold sores',
        'Minor pain and fever',
        'Urinary tract infections'
      ]
    },
    {
      providerType: 'other',
      expectedSpecialties: [
        'Minor cuts and scrapes',
        'Sprains and strains',
        'Minor acne',
        'Conjunctivitis (pink eye)'
      ]
    },
    {
      providerType: 'pharmacist',
      expectedSpecialties: MINOR_AILMENT_SPECIALTIES.slice(0, 8)
    }
  ];
}