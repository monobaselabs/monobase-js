/**
 * EMR Module E2E Test Helpers
 * Provides helper functions for testing consultation notes and patient summaries
 */

import type { ApiClient } from './client';
import type { paths } from '@monobase/api-spec';

// ============================================================================
// Types and Interfaces
// ============================================================================

// Export types from the OpenAPI spec for easy access
export type ConsultationNote = paths['/emr/consultations/{consultation}']['get']['responses']['200']['content']['application/json'];
export type ConsultationCreateRequest = paths['/emr/consultations']['post']['requestBody']['content']['application/json'];
export type ConsultationUpdateRequest = paths['/emr/consultations/{consultation}']['patch']['requestBody']['content']['application/json'];
export type ConsultationListResponse = paths['/emr/consultations']['get']['responses']['200']['content']['application/json'];

export interface ConsultationListParams {
  // TypeSpec-supported parameters
  patient?: string;                        // Patient filter per TypeSpec
  status?: 'draft' | 'finalized' | 'amended'; // Status filter per TypeSpec
  limit?: number;                          // Pagination per TypeSpec
  offset?: number;                         // Pagination per TypeSpec

  // Legacy parameters for backward compatibility (will be converted)
  page?: number;                           // Converted to offset internally
  pageSize?: number;                       // Converted to limit internally

  // Unsupported parameters (will be ignored with warnings)
  startDate?: string;                      // Not supported in TypeSpec
  endDate?: string;                        // Not supported in TypeSpec
  expand?: string;                         // Not supported in TypeSpec
  sort?: string;                           // Not supported in TypeSpec
}

// ============================================================================
// API Helper Functions
// ============================================================================

/**
 * Create a consultation note with direct patient/provider per TypeSpec
 * POST /emr/consultations
 */
export async function createConsultation(
  client: ApiClient,
  consultationData: ConsultationCreateRequest
): Promise<{ response: Response; data: ConsultationNote | null }> {
  const response = await client.fetch(`/emr/consultations`, {
    method: 'POST',
    body: consultationData
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Get a specific consultation note
 * GET /emr/consultations/{consultation}
 */
export async function getConsultation(
  client: ApiClient,
  consultationId: string
): Promise<{ response: Response; data: ConsultationNote | null }> {
  const response = await client.fetch(`/emr/consultations/${consultationId}`);
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Update a consultation note (draft only)
 * PATCH /emr/consultations/{consultation}
 */
export async function updateConsultation(
  client: ApiClient,
  consultationId: string,
  updateData: ConsultationUpdateRequest
): Promise<{ response: Response; data: ConsultationNote | null }> {
  const response = await client.fetch(`/emr/consultations/${consultationId}`, {
    method: 'PATCH',
    body: updateData
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * Finalize a consultation note
 * POST /emr/consultations/{consultation}/finalize
 */
export async function finalizeConsultation(
  client: ApiClient,
  consultationId: string
): Promise<{ response: Response; data: ConsultationNote | null }> {
  const response = await client.fetch(`/emr/consultations/${consultationId}/finalize`, {
    method: 'POST',
    body: {}
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * List consultations with TypeSpec-compliant parameters and backward compatibility
 * GET /emr/consultations
 */
export async function listConsultations(
  client: ApiClient,
  params?: ConsultationListParams
): Promise<{ response: Response; data: ConsultationListResponse | null }> {
  const searchParams: Record<string, any> = {};

  if (params) {
    // Handle TypeSpec-supported parameters
    if (params.patient) searchParams.patient = params.patient;
    if (params.status) searchParams.status = params.status;

    // Handle pagination - prioritize TypeSpec format, fallback to legacy format
    if (params.limit !== undefined) {
      searchParams.limit = params.limit;
    } else if (params.pageSize !== undefined) {
      searchParams.limit = params.pageSize;
      console.warn('pageSize parameter is deprecated, use limit instead');
    }

    if (params.offset !== undefined) {
      searchParams.offset = params.offset;
    } else if (params.page !== undefined) {
      // Convert page to offset (page is 1-based, offset is 0-based)
      const limit = searchParams.limit || 25; // Default limit
      searchParams.offset = (params.page - 1) * limit;
      console.warn('page parameter is deprecated, use offset instead');
    }

    // Warn about unsupported parameters
    const unsupportedParams = ['startDate', 'endDate', 'expand', 'sort'];
    for (const param of unsupportedParams) {
      if (params[param as keyof ConsultationListParams]) {
        console.warn(`Parameter '${param}' is not supported in TypeSpec and will be ignored`);
      }
    }
  }

  const response = await client.fetch(`/emr/consultations`, {
    searchParams: Object.keys(searchParams).length > 0 ? searchParams : undefined
  });
  const data = response.ok ? await response.json() : null;
  return { response, data };
}

/**
 * List patient consultations (convenience wrapper)
 * Uses /emr/consultations?patient={uuid}
 */
export async function listPatientConsultations(
  client: ApiClient,
  patientId: string,
  params?: Omit<ConsultationListParams, 'patient'>
): Promise<{ response: Response; data: ConsultationListResponse | null }> {
  return listConsultations(client, { ...params, patient: patientId });
}


// ============================================================================
// Data Generation Functions
// ============================================================================

/**
 * Generate test consultation data for creation per TypeSpec (patient/provider required)
 * Uses standardized numeric fields with proper medical units
 */
export function generateTestConsultationData(patientId: string, providerId: string, overrides?: Partial<ConsultationCreateRequest>): ConsultationCreateRequest {
  return {
    patient: patientId,
    provider: providerId,
    context: `consultation-${Date.now()}`, // Optional context for idempotency
    chiefComplaint: 'Patient reports persistent headaches for the past week',
    assessment: 'Likely tension headaches related to stress and poor sleep hygiene. No neurological symptoms present.',
    plan: 'Recommend stress management techniques, improve sleep schedule, follow up in 2 weeks if symptoms persist.',
    vitals: {
      temperatureCelsius: 37.0,
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: 72,
      weightKg: 74.8,      // ~165 lbs
      heightCm: 172.7,     // ~68 inches
      oxygenSaturation: 98,
      respiratoryRate: 16
    },
    symptoms: {
      onset: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      durationHours: 168,  // 7 days
      severity: 'moderate',
      description: 'Persistent bilateral headaches, throbbing in nature',
      associated: ['fatigue', 'stress'],
      denies: ['fever', 'nausea']
    },
    prescriptions: [
      {
        medication: 'Ibuprofen',
        dosageAmount: 400,
        dosageUnit: 'mg',
        frequency: 'as needed',
        durationDays: 7,
        instructions: 'Take as needed for pain, max 3 times daily'
      }
    ],
    followUp: {
      needed: true,
      timeframeDays: 14,   // 2 weeks
      instructions: 'Return if headaches worsen or new symptoms develop'
    },
    ...overrides
  };
}

/**
 * Generate minimal consultation data for testing per TypeSpec
 */
export function generateMinimalConsultationData(patientId: string, providerId: string): ConsultationCreateRequest {
  return {
    patient: patientId,
    provider: providerId,
    chiefComplaint: 'Routine checkup',
    assessment: 'Patient appears healthy',
    plan: 'Continue current lifestyle, annual follow-up'
  };
}

/**
 * Generate consultation update data per TypeSpec (supports explicit nulls)
 * Uses standardized numeric fields
 */
export function generateConsultationUpdateData(overrides?: Partial<ConsultationUpdateRequest>): ConsultationUpdateRequest {
  return {
    assessment: 'Updated assessment after additional examination',
    plan: 'Modified treatment plan based on new findings',
    vitals: {
      systolicBp: 118,
      diastolicBp: 76,
      heartRate: 68
    },
    ...overrides
  };
}

/**
 * Generate complex consultation with multiple sections per TypeSpec
 * Uses standardized numeric fields throughout
 */
export function generateComplexConsultationData(patientId: string, providerId: string): ConsultationCreateRequest {
  return {
    patient: patientId,
    provider: providerId,
    context: `complex-consultation-${Date.now()}`,
    chiefComplaint: 'Multiple complaints: chest pain, shortness of breath, and fatigue lasting 3 days',
    assessment: `
      1. Atypical chest pain - likely musculoskeletal given reproducible pain on palpation
      2. Mild dyspnea - possibly related to anxiety and deconditioning
      3. Fatigue - multifactorial (poor sleep, stress, possible viral syndrome)

      Cardiac workup negative, no acute distress observed.
    `,
    plan: `
      1. Symptomatic management with NSAIDs for chest wall pain
      2. Breathing exercises and gradual activity increase
      3. Sleep hygiene counseling
      4. Follow-up in 1 week or sooner if symptoms worsen
      5. Consider stress test if symptoms persist
    `,
    vitals: {
      temperatureCelsius: 37.3,  // 99.1°F
      systolicBp: 128,
      diastolicBp: 84,
      heartRate: 88,
      weightKg: 74.8,            // ~165 lbs
      heightCm: 172.7,           // ~68 inches
      respiratoryRate: 18,
      oxygenSaturation: 97
    },
    symptoms: {
      onset: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      durationHours: 72,         // 3 days
      severity: 'severe',
      description: 'Multiple complaints: chest pain, shortness of breath, and fatigue',
      associated: ['chest pain', 'shortness of breath', 'fatigue'],
      denies: ['nausea', 'vomiting', 'fever']
    },
    prescriptions: [
      {
        medication: 'Ibuprofen',
        dosageAmount: 600,
        dosageUnit: 'mg',
        frequency: 'twice daily',
        durationDays: 5,
        instructions: 'Take with food, twice daily for 5 days'
      }
    ],
    followUp: {
      needed: true,
      timeframeDays: 7,          // 1 week
      instructions: 'Return immediately if chest pain worsens or new symptoms develop'
    },
    externalDocumentation: {
      labResults: 'CBC, BMP pending',
      imaging: 'CXR - clear lungs, normal heart size',
      referrals: 'None at this time'
    }
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate consultation response structure per TypeSpec
 */
export function validateConsultationResponse(consultation: any): boolean {
  if (!consultation || typeof consultation !== 'object') return false;

  const requiredFields = [
    'id', 'createdAt', 'updatedAt', 'version',
    'patient', 'provider', 'status'
  ];

  for (const field of requiredFields) {
    if (!(field in consultation)) return false;
  }

  // Validate status enum
  const validStatuses = ['draft', 'finalized', 'amended'];
  if (!validStatuses.includes(consultation.status)) return false;

  // Optional fields can be null or undefined per TypeSpec
  if (consultation.chiefComplaint && (consultation.chiefComplaint.length === 0 || consultation.chiefComplaint.length > 500)) return false;
  if (consultation.assessment && (consultation.assessment.length === 0 || consultation.assessment.length > 2000)) return false;
  if (consultation.plan && (consultation.plan.length === 0 || consultation.plan.length > 2000)) return false;

  return true;
}


/**
 * Validate consultation list response structure per TypeSpec with backward compatibility
 */
export function validateConsultationListResponse(response: any): boolean {
  if (!response || typeof response !== 'object') return false;

  if (!('data' in response) || !Array.isArray(response.data)) return false;
  if (!('pagination' in response)) return false;

  const pagination = response.pagination;

  // Check for TypeSpec pagination fields
  const typeSpecFields = ['offset', 'limit', 'hasMore'];
  const hasTypeSpecFields = typeSpecFields.every(field => field in pagination);

  // Check for backward compatibility fields
  const backwardCompatFields = ['page', 'pageSize', 'totalCount'];
  const hasBackwardCompatFields = backwardCompatFields.every(field => field in pagination);

  // Response should have either TypeSpec format or both formats
  // (buildPaginationMeta provides both, so we accept either)
  return hasTypeSpecFields || hasBackwardCompatFields;
}

// ============================================================================
// Test Utility Functions
// ============================================================================

/**
 * Wait for consultation to be finalized
 */
export async function waitForConsultationFinalized(
  client: ApiClient,
  consultationId: string,
  maxAttempts: number = 10,
  delayMs: number = 500
): Promise<ConsultationNote | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await getConsultation(client, consultationId);
    if (data?.status === 'finalized') {
      return data;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

/**
 * Create consultation and verify response per TypeSpec
 */
export async function createAndVerifyConsultation(
  client: ApiClient,
  patientId: string,
  providerId: string,
  consultationData?: Partial<ConsultationCreateRequest>
): Promise<ConsultationNote> {
  const data = consultationData
    ? generateTestConsultationData(patientId, providerId, consultationData)
    : generateTestConsultationData(patientId, providerId);

  const { response, data: consultation } = await createConsultation(client, data);

  if (response.status !== 201 || !consultation) {
    throw new Error(`Failed to create consultation: ${response.status}`);
  }

  if (!validateConsultationResponse(consultation)) {
    throw new Error('Invalid consultation response structure');
  }

  return consultation;
}

/**
 * Generate test vitals data with standardized units
 */
export function generateTestVitals(): Record<string, any> {
  return {
    systolicBp: Math.floor(Math.random() * 40) + 100,     // 100-140 mmHg
    diastolicBp: Math.floor(Math.random() * 30) + 60,     // 60-90 mmHg
    heartRate: Math.floor(Math.random() * 40) + 60,       // 60-100 bpm
    temperatureCelsius: Math.round((Math.random() * 2 + 36.5) * 10) / 10, // 36.5-38.5°C
    respiratoryRate: Math.floor(Math.random() * 8) + 12,  // 12-20 breaths/min
    oxygenSaturation: Math.floor(Math.random() * 5) + 95, // 95-100%
    weightKg: Math.round((Math.random() * 45 + 54.4) * 10) / 10, // 54.4-99.8 kg (120-220 lbs)
    heightCm: Math.round(Math.random() * 30 + 152.4)      // 152.4-182.9 cm (60-72 inches)
  };
}
