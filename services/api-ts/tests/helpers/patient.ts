/**
 * Patient E2E Test Helper Functions
 * Provides utilities for testing patient-related endpoints
 */

import { faker } from '@faker-js/faker';
import type { ApiClient } from './client';
import { 
  generateTestPersonData, 
  type PersonCreateRequest 
} from './person';
import type { paths } from '@monobase/api-spec';

// Export types from the OpenAPI spec for easy access
export type Patient = paths['/patients/{patient}']['get']['responses']['200']['content']['application/json'];
export type PatientCreateRequest = paths['/patients']['post']['requestBody']['content']['application/json'];
export type PatientUpdateRequest = paths['/patients/{patient}']['patch']['requestBody']['content']['application/json'];
export type ListPatientsResponse = paths['/patients']['get']['responses']['200']['content']['application/json'];

// Re-export nested types for backward compatibility
export type PatientResponse = Patient;
export type ProviderInfo = Patient['primaryProvider'];
export type PharmacyInfo = Patient['primaryPharmacy'];

/**
 * Generate realistic test patient data using faker
 */
export function generateTestPatientData(overrides: Partial<PatientCreateRequest> = {}): PatientCreateRequest {
  const personData = generateTestPersonData();
  
  // Generate valid US phone numbers in E.164 format
  // US phone: +1 (area code 2-9XX) (exchange 2-9XX) (line XXXX)
  const generateUSPhone = () => {
    const areaCode = faker.helpers.arrayElement(['415', '510', '650', '408', '925', '707']);
    const exchange = faker.string.numeric(3).replace(/^[01]/, '2'); // Ensure first digit is 2-9
    const line = faker.string.numeric(4);
    return `+1${areaCode}${exchange}${line}`;
  };
  
  return {
    person: personData,
    primaryProvider: {
      name: faker.person.fullName() + ', MD',
      specialty: faker.helpers.arrayElement([
        'Family Medicine',
        'Internal Medicine',
        'Pediatrics',
        'Cardiology',
        'Dermatology',
        'Orthopedics'
      ]),
      phone: generateUSPhone(),
      fax: generateUSPhone()
    },
    primaryPharmacy: {
      name: faker.helpers.arrayElement([
        'CVS Pharmacy',
        'Walgreens',
        'Rite Aid',
        'Walmart Pharmacy',
        'Kroger Pharmacy'
      ]),
      address: faker.location.streetAddress() + ', ' + faker.location.city() + ', ' + faker.location.state({ abbreviated: true }) + ' ' + faker.location.zipCode(),
      phone: generateUSPhone(),
      fax: generateUSPhone()
    },
    ...overrides
  };
}

/**
 * Generate minimal patient data for testing required fields
 */
export function generateMinimalPatientData(): PatientCreateRequest {
  return {
    person: {
      firstName: faker.person.firstName()
    }
  };
}

/**
 * Generate invalid patient data for validation testing
 */
export function generateInvalidPatientData(): Record<string, any> {
  return {
    person: {
      firstName: '' // Empty required field
    },
    primaryProvider: {
      name: '', // Empty name
      phone: 'invalid-phone'
    },
    primaryPharmacy: {
      name: '', // Empty name
      phone: 'invalid-phone'
    }
  };
}

/**
 * Create a patient via API
 */
export async function createPatient(
  apiClient: ApiClient,
  data: PatientCreateRequest
): Promise<{ response: Response; data?: PatientResponse }> {
  const response = await apiClient.fetch('/patients', {
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
 * Get a patient by ID
 */
export async function getPatient(
  apiClient: ApiClient,
  patientId: string
): Promise<{ response: Response; data?: PatientResponse }> {
  const response = await apiClient.fetch(`/patients/${patientId}`);

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Get current user's patient profile via /patients/me
 */
export async function getMyPatient(
  apiClient: ApiClient,
  params?: { expand?: string[] }
): Promise<{ response: Response; data?: PatientResponse }> {
  const response = await apiClient.fetch('/patients/me', {
    searchParams: params
  });

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Update a patient
 */
export async function updatePatient(
  apiClient: ApiClient,
  patientId: string,
  data: PatientUpdateRequest
): Promise<{ response: Response; data?: PatientResponse }> {
  const response = await apiClient.fetch(`/patients/${patientId}`, {
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
 * Delete a patient (soft delete)
 */
export async function deletePatient(
  apiClient: ApiClient,
  patientId: string
): Promise<{ response: Response }> {
  const response = await apiClient.fetch(`/patients/${patientId}`, {
    method: 'DELETE'
  });

  return { response };
}

/**
 * List patients with optional filters
 */
export async function listPatients(
  apiClient: ApiClient,
  params: {
    page?: number;
    pageSize?: number;
    sort?: string;
    order?: 'asc' | 'desc';
  } = {}
): Promise<{ response: Response; data?: ListPatientsResponse }> {
  const response = await apiClient.fetch('/patients', {
    searchParams: params  // Clean query param handling!
  });

  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}


/**
 * Wait for patient to be available (useful after creation)
 */
export async function waitForPatient(
  apiClient: ApiClient,
  patientId: string,
  maxRetries = 5
): Promise<PatientResponse | null> {
  for (let i = 0; i < maxRetries; i++) {
    const { response, data } = await getPatient(apiClient, patientId);
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
export function generateBulkPatientData(count: number): PatientCreateRequest[] {
  return Array.from({ length: count }, () => generateTestPatientData());
}

/**
 * Validate patient response structure
 */
export function validatePatientResponse(patient: any): patient is PatientResponse {
  return (
    typeof patient === 'object' &&
    typeof patient.id === 'string' &&
    typeof patient.person === 'string' && // UUID reference
    typeof patient.createdAt === 'string' &&
    typeof patient.updatedAt === 'string'
  );
}

/**
 * Generate different provider scenarios
 */
export function generateProviderScenarios(): ProviderInfo[] {
  return [
    {
      name: 'Dr. John Smith, MD',
      specialty: 'Family Medicine',
      phone: '+14155551234'
    },
    {
      name: 'Dr. Sarah Johnson, DO',
      specialty: 'Internal Medicine',
      phone: '+14155555678',
      fax: '+14155559012'
    },
    {
      name: 'Dr. Michael Brown, MD',
      specialty: 'Pediatrics',
      phone: '+14155553456'
    }
  ];
}

/**
 * Generate different pharmacy scenarios
 */
export function generatePharmacyScenarios(): PharmacyInfo[] {
  return [
    {
      name: 'CVS Pharmacy',
      address: '123 Main St, San Francisco, CA 94102',
      phone: '+14155551111'
    },
    {
      name: 'Walgreens',
      address: '456 Market St, San Francisco, CA 94103',
      phone: '+14155552222',
      fax: '+14155553333'
    },
    {
      name: 'Local Community Pharmacy',
      address: '789 Mission St, San Francisco, CA 94105',
      phone: '+14155554444'
    }
  ];
}