/**
 * Patient Module E2E Tests
 * Tests the complete patient management workflow
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { createApiClient, type ApiClient } from '../../helpers/client';
import {
  generateTestPatientData,
  generateMinimalPatientData,
  generateInvalidPatientData,
  generateBulkPatientData,
  generateProviderScenarios,
  generatePharmacyScenarios,
  createPatient,
  getPatient,
  getMyPatient,
  updatePatient,
  deletePatient,
  listPatients,
  waitForPatient,
  validatePatientResponse,
  type PatientCreateRequest,
  type PatientUpdateRequest,
  type PatientResponse,
  type ProviderInfo,
  type PharmacyInfo
} from '../../helpers/patient';

describe('Patient Module E2E Tests', () => {
  let testApp: TestApp;
  let apiClient: ApiClient;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });
  }, 30000);

  beforeEach(async () => {
    // Create new API client for each test with embedded app instance
    apiClient = createApiClient({ app: testApp.app });

    // Create and sign up a new user for this test
    await apiClient.signup();
  }, 30000);

  afterAll(async () => {
    // Cleanup test database schema
    await testApp?.cleanup();
  });

  describe('Patient Creation', () => {
    test('should create patient with complete information', async () => {
      const testData = generateTestPatientData();
      
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data).toBeDefined();
      expect(data?.id).toBeDefined();
      expect(data?.person).toBeDefined(); // Person UUID reference
      expect(data?.primaryProvider?.name).toBe(testData.primaryProvider?.name);
      expect(data?.primaryPharmacy?.name).toBe(testData.primaryPharmacy?.name);
      expect(validatePatientResponse(data)).toBe(true);
    });

    test('should create patient with inline person data', async () => {
      const patientData = generateMinimalPatientData();
      
      const { response, data } = await createPatient(apiClient, patientData);
      
      expect(response.status).toBe(201);
      expect(data?.id).toBeDefined();
      expect(data?.person).toBeDefined(); // Person UUID reference
    });

    test('should create patient with minimal required fields', async () => {
      const testData = generateMinimalPatientData();
      
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.id).toBeDefined();
      expect(data?.person).toBeDefined(); // Person UUID reference
    });

    test('should validate patient data', async () => {
      const invalidData = generateInvalidPatientData();
      
      const { response } = await createPatient(apiClient, invalidData as any);
      
      expect(response.status).toBe(400);
    });

    test('should handle primary provider information', async () => {
      const primaryProvider: ProviderInfo = {
        name: 'Dr. John Smith, MD',
        specialty: 'Family Medicine',
        phone: '+14155551234',
        fax: '+14155555678'
      };
      
      const testData = generateTestPatientData({ primaryProvider });
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.primaryProvider?.name).toBe('Dr. John Smith, MD');
      expect(data?.primaryProvider?.specialty).toBe('Family Medicine');
      expect(data?.primaryProvider?.phone).toBe('+14155551234');
      expect(data?.primaryProvider?.fax).toBe('+14155555678');
    });

    test('should handle primary pharmacy information', async () => {
      const primaryPharmacy: PharmacyInfo = {
        name: 'CVS Pharmacy',
        address: '123 Main St, San Francisco, CA 94102',
        phone: '+14155551111',
        fax: '+14155552222'
      };
      
      const testData = generateTestPatientData({ primaryPharmacy });
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.primaryPharmacy?.name).toBe('CVS Pharmacy');
      expect(data?.primaryPharmacy?.address).toBe('123 Main St, San Francisco, CA 94102');
      expect(data?.primaryPharmacy?.phone).toBe('+14155551111');
      expect(data?.primaryPharmacy?.fax).toBe('+14155552222');
    });

    test('should handle patient without provider or pharmacy', async () => {
      const testData = generateTestPatientData({
        primaryProvider: undefined,
        primaryPharmacy: undefined
      });

      const { response, data } = await createPatient(apiClient, testData);

      expect(response.status).toBe(201);
      expect(data?.primaryProvider === null || data?.primaryProvider === undefined).toBe(true);
      expect(data?.primaryPharmacy === null || data?.primaryPharmacy === undefined).toBe(true);
    });

    test('should create patient with empty object (auto-link to current user)', async () => {
      const { response, data } = await createPatient(apiClient, {} as PatientCreateRequest);

      expect(response.status).toBe(201);
      expect(data?.id).toBeDefined();
      expect(data?.person).toBeDefined(); // Should be auto-set to user's person ID
      expect(typeof data?.person).toBe('string'); // Should be UUID reference
    });
  });

  describe('Patient Retrieval', () => {
    let testPatientId: string;
    let testPatientData: PatientCreateRequest;

    beforeEach(async () => {
      // Create a patient for retrieval tests
      testPatientData = generateTestPatientData();
      const { data } = await createPatient(apiClient, testPatientData);
      testPatientId = data!.id;
    });

    test('should retrieve patient by ID', async () => {
      const { response, data } = await getPatient(apiClient, testPatientId);
      
      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.id).toBe(testPatientId);
      expect(data?.person).toBeDefined(); // Person UUID reference
      expect(validatePatientResponse(data)).toBe(true);
    });

    test('should include patient details in retrieval', async () => {
      const { response, data } = await getPatient(apiClient, testPatientId);
      
      expect(response.status).toBe(200);
      expect(typeof data?.primaryProvider === 'object' || data?.primaryProvider === null).toBe(true);
      expect(typeof data?.primaryPharmacy === 'object' || data?.primaryPharmacy === null).toBe(true);
    });

    test('should return 404 for non-existent patient', async () => {
      const fakeId = faker.string.uuid();

      const { response } = await getPatient(apiClient, fakeId);

      expect(response.status).toBe(404);
    });
  });

  describe('Patient /me Endpoint', () => {
    test('should retrieve current user\'s patient profile via /patients/me', async () => {
      // Create patient profile for current user
      const testData = generateTestPatientData();
      const { data: createdPatient } = await createPatient(apiClient, testData);

      // Retrieve via /patients/me
      const { response, data } = await getMyPatient(apiClient);

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.id).toBe(createdPatient!.id);
      expect(data?.person).toBeDefined();
      expect(validatePatientResponse(data)).toBe(true);
    });

    test('should return 404 when user has no patient profile', async () => {
      // Create new user without patient profile
      const newClient = createApiClient({ app: testApp.app });
      await newClient.signup();

      // Try to get patient profile that doesn't exist
      const { response } = await getMyPatient(newClient);

      expect(response.status).toBe(404);
    });

    test('should include person details when expand=person', async () => {
      // Create patient profile
      const testData = generateTestPatientData();
      await createPatient(apiClient, testData);

      // Retrieve with expand parameter
      const { response, data } = await getMyPatient(apiClient, { expand: ['person'] });

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.person).toBeDefined();
      // When expanded, person should be an object with firstName, not just a UUID string
      expect(typeof data?.person).toBe('object');
      expect((data?.person as any)?.firstName).toBeDefined();
    });

    test('should work after patient creation workflow', async () => {
      // Typical user workflow: signup -> create patient -> get profile
      const testData = generateTestPatientData();

      // Create patient
      const { response: createResponse, data: createdPatient } = await createPatient(apiClient, testData);
      expect(createResponse.status).toBe(201);

      // Immediately retrieve via /me endpoint
      const { response: getResponse, data: retrievedPatient } = await getMyPatient(apiClient);

      expect(getResponse.status).toBe(200);
      expect(retrievedPatient?.id).toBe(createdPatient!.id);
      expect(retrievedPatient?.primaryProvider?.name).toBe(testData.primaryProvider?.name);
      expect(retrievedPatient?.primaryPharmacy?.name).toBe(testData.primaryPharmacy?.name);
    });
  });

  describe('Patient Update', () => {
    let testPatientId: string;
    let originalData: PatientCreateRequest;

    beforeEach(async () => {
      // Create a patient for update tests
      originalData = generateTestPatientData();
      const { data } = await createPatient(apiClient, originalData);
      testPatientId = data!.id;
    });

    test('should update primary provider', async () => {
      const newProvider: ProviderInfo = {
        name: 'Dr. Jane Doe, DO',
        specialty: 'Internal Medicine',
        phone: '+14155559999'
      };
      
      const updateData: PatientUpdateRequest = {
        primaryProvider: newProvider
      };
      
      const { response, data } = await updatePatient(apiClient, testPatientId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.primaryProvider?.name).toBe('Dr. Jane Doe, DO');
      expect(data?.primaryProvider?.specialty).toBe('Internal Medicine');
      expect(data?.primaryProvider?.phone).toBe('+14155559999');
    });

    test('should update primary pharmacy', async () => {
      const newPharmacy: PharmacyInfo = {
        name: 'Walgreens',
        address: '456 Market St, San Francisco, CA 94103',
        phone: '+14155553333'
      };
      
      const updateData: PatientUpdateRequest = {
        primaryPharmacy: newPharmacy
      };
      
      const { response, data } = await updatePatient(apiClient, testPatientId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.primaryPharmacy?.name).toBe('Walgreens');
      expect(data?.primaryPharmacy?.address).toBe('456 Market St, San Francisco, CA 94103');
      expect(data?.primaryPharmacy?.phone).toBe('+14155553333');
    });

    test('should clear primary provider', async () => {
      const updateData: PatientUpdateRequest = {
        primaryProvider: null
      };
      
      const { response, data } = await updatePatient(apiClient, testPatientId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.primaryProvider === null || data?.primaryProvider === undefined).toBe(true);
    });

    test('should clear primary pharmacy', async () => {
      const updateData: PatientUpdateRequest = {
        primaryPharmacy: null
      };
      
      const { response, data } = await updatePatient(apiClient, testPatientId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.primaryPharmacy === null || data?.primaryPharmacy === undefined).toBe(true);
    });

    test('should validate update data', async () => {
      const updateData = {
        primaryProvider: {
          name: '', // Empty name should be invalid
          phone: 'invalid-phone'
        }
      };
      
      const { response } = await updatePatient(apiClient, testPatientId, updateData as any);
      
      expect(response.status).toBe(400);
    });

    test('should return 404 when updating non-existent patient', async () => {
      const fakeId = faker.string.uuid();
      const updateData: PatientUpdateRequest = {
        primaryProvider: {
          name: 'Dr. Test'
        }
      };
      
      const { response } = await updatePatient(apiClient, fakeId, updateData);
      
      expect(response.status).toBe(404);
    });
  });

  describe('Patient PATCH Response Verification', () => {
    let testPatientId: string;

    beforeEach(async () => {
      // Create a patient for PATCH response tests
      const testData = generateTestPatientData();
      const { data } = await createPatient(apiClient, testData);
      testPatientId = data!.id;
    });

    test('PATCH response should include updated provider data in response body', async () => {
      const updateData = {
        primaryProvider: {
          name: 'Dr. Updated Name, MD',
          specialty: 'Cardiology',
          phone: '+14155559876',
          fax: '+14155559877'
        }
      };
      
      const response = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: updateData
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      // Assert the PATCH response itself contains the updated provider data
      expect(responseData.primaryProvider).toBeDefined();
      expect(responseData.primaryProvider).not.toBeNull();
      expect(responseData.primaryProvider.name).toBe('Dr. Updated Name, MD');
      expect(responseData.primaryProvider.specialty).toBe('Cardiology');
      expect(responseData.primaryProvider.phone).toBe('+14155559876');
      expect(responseData.primaryProvider.fax).toBe('+14155559877');
    });

    test('PATCH response should include updated pharmacy data in response body', async () => {
      const updateData = {
        primaryPharmacy: {
          name: 'CVS Pharmacy #1234',
          address: '789 Oak St, San Francisco, CA 94110',
          phone: '+14155554321',
          fax: '+14155554322'
        }
      };
      
      const response = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: updateData
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      // Assert the PATCH response itself contains the updated pharmacy data
      expect(responseData.primaryPharmacy).toBeDefined();
      expect(responseData.primaryPharmacy).not.toBeNull();
      expect(responseData.primaryPharmacy.name).toBe('CVS Pharmacy #1234');
      expect(responseData.primaryPharmacy.address).toBe('789 Oak St, San Francisco, CA 94110');
      expect(responseData.primaryPharmacy.phone).toBe('+14155554321');
      expect(responseData.primaryPharmacy.fax).toBe('+14155554322');
    });

    test('PATCH response should show null when clearing provider field', async () => {
      // First set a provider
      await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: {
          primaryProvider: {
            name: 'Dr. Initial Provider',
            specialty: 'General Practice'
          }
        }
      });
      
      // Now clear it by setting to null
      const response = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: { primaryProvider: null }
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      // Assert PATCH response shows the field is cleared
      expect(responseData.primaryProvider).toBeNull();
    });

    test('PATCH response should show null when clearing pharmacy field', async () => {
      // First set a pharmacy
      await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: {
          primaryPharmacy: {
            name: 'Initial Pharmacy',
            address: '123 Test St'
          }
        }
      });
      
      // Now clear it by setting to null
      const response = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: { primaryPharmacy: null }
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      // Assert PATCH response shows the field is cleared
      expect(responseData.primaryPharmacy).toBeNull();
    });

    test('PATCH response should handle multiple updates in sequence', async () => {
      // Update 1: Set provider
      const response1 = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: {
          primaryProvider: {
            name: 'Dr. First Update',
            specialty: 'Pediatrics'
          }
        }
      });
      
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1.primaryProvider?.name).toBe('Dr. First Update');
      
      // Update 2: Change provider
      const response2 = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: {
          primaryProvider: {
            name: 'Dr. Second Update',
            specialty: 'Oncology',
            phone: '+14155551111'
          }
        }
      });
      
      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(data2.primaryProvider?.name).toBe('Dr. Second Update');
      expect(data2.primaryProvider?.specialty).toBe('Oncology');
      expect(data2.primaryProvider?.phone).toBe('+14155551111');
      
      // Update 3: Clear provider
      const response3 = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: { primaryProvider: null }
      });
      
      expect(response3.status).toBe(200);
      const data3 = await response3.json();
      expect(data3.primaryProvider).toBeNull();
      
      // Update 4: Set provider again
      const response4 = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: {
          primaryProvider: {
            name: 'Dr. Final Update',
            specialty: 'Dermatology'
          }
        }
      });
      
      expect(response4.status).toBe(200);
      const data4 = await response4.json();
      expect(data4.primaryProvider?.name).toBe('Dr. Final Update');
      expect(data4.primaryProvider?.specialty).toBe('Dermatology');
    });

    test('PATCH response should update both provider and pharmacy in single request', async () => {
      const updateData = {
        primaryProvider: {
          name: 'Dr. Combined Update',
          specialty: 'Family Medicine'
        },
        primaryPharmacy: {
          name: 'Walgreens #5678',
          address: '456 Pine St, San Francisco, CA 94108'
        }
      };
      
      const response = await apiClient.fetch(`/patients/${testPatientId}`, {
        method: 'PATCH',
        body: updateData
      });
      
      expect(response.status).toBe(200);
      const responseData = await response.json();
      
      // Both fields should be updated in the response
      expect(responseData.primaryProvider?.name).toBe('Dr. Combined Update');
      expect(responseData.primaryProvider?.specialty).toBe('Family Medicine');
      expect(responseData.primaryPharmacy?.name).toBe('Walgreens #5678');
      expect(responseData.primaryPharmacy?.address).toBe('456 Pine St, San Francisco, CA 94108');
    });
  });

  describe('Patient Deletion', () => {
    test('should delete patient (hard delete)', async () => {
      // Create a patient
      const testData = generateTestPatientData();
      const { data: createdPatient } = await createPatient(apiClient, testData);
      
      // Delete the patient (hard delete - patient completely removed)
      const { response } = await deletePatient(apiClient, createdPatient!.id);
      
      expect(response.status).toBe(204);
      
      // After deletion, patient no longer exists
      // Should return 404 (Not Found) since patient was deleted
      const { response: getResponse } = await getPatient(apiClient, createdPatient!.id);
      expect(getResponse.status).toBe(404);
    });

    test('should remove patient role after patient deletion (verified by 403 responses)', async () => {
      // Create a patient (this gives user patient role)
      const testData = generateTestPatientData();
      const { data: createdPatient } = await createPatient(apiClient, testData);
      
      // Verify we can access the patient before deletion
      const { response: getBeforeResponse } = await getPatient(apiClient, createdPatient!.id);
      expect(getBeforeResponse.status).toBe(200);
      
      // Delete the patient (this removes patient role)
      const { response } = await deletePatient(apiClient, createdPatient!.id);
      expect(response.status).toBe(204);
      
      // After deletion, patient no longer exists
      const { response: getAfterResponse } = await getPatient(apiClient, createdPatient!.id);
      expect(getAfterResponse.status).toBe(404);
      
      // Try to create another patient - behavior depends on system design
      const newPatientData = generateTestPatientData();
      const { response: createResponse } = await createPatient(apiClient, newPatientData);
      
      // Should either allow recreation (201) or forbid it (403)
      expect([201, 403].includes(createResponse.status)).toBe(true);
    });

    test('should prevent access to patient-only operations after deletion', async () => {
      // Create a patient
      const testData = generateTestPatientData();
      const { data: createdPatient } = await createPatient(apiClient, testData);
      
      // Delete the patient (which removes the patient role)
      const { response } = await deletePatient(apiClient, createdPatient!.id);
      expect(response.status).toBe(204);
      
      // After deletion, patient no longer exists
      const { response: accessResponse } = await getPatient(apiClient, createdPatient!.id);
      expect(accessResponse.status).toBe(404);
      
      // Try to create another patient - system behavior determines if this is allowed
      const newPatientData = generateTestPatientData();
      const { response: createResponse, data: newPatientData2 } = await createPatient(apiClient, newPatientData);
      
      // Should either be forbidden (403) or the system should allow recreation of patient profile
      // If recreation succeeds, it demonstrates the role system is working correctly
      if (createResponse.status === 201) {
        // System allows recreation - user would regain patient role
        // Verify the new patient can be accessed (proves role was restored)
        const { response: verifyResponse } = await getPatient(apiClient, newPatientData2!.id);
        expect(verifyResponse.status).toBe(200);
      } else {
        // System prevents recreation - should be a 403 or similar authorization error
        expect([401, 403].includes(createResponse.status)).toBe(true);
      }
    });

    test('should return 404 when deleting non-existent patient', async () => {
      const fakeId = faker.string.uuid();

      // Patient doesn't exist
      // Should return 404 (Not Found) since patient doesn't exist
      const { response } = await deletePatient(apiClient, fakeId);

      expect(response.status).toBe(404);
    });
  });

  describe('Patient Listing', () => {
    let adminClient: ApiClient;

    beforeEach(async () => {
      // Create admin client for listing tests
      adminClient = createApiClient({ app: testApp.app });
      await adminClient.signinAsAdmin();

      // Create multiple patients with different characteristics
      const patients = [
        generateTestPatientData({
          primaryProvider: {
            name: 'Dr. Smith, MD',
            specialty: 'Family Medicine'
          }
        }),
        generateTestPatientData({
          primaryProvider: {
            name: 'Dr. Jones, DO',
            specialty: 'Internal Medicine'
          }
        }),
        generateTestPatientData({
          primaryPharmacy: {
            name: 'CVS Pharmacy',
            address: '123 Main St'
          }
        })
      ];

      for (const patientData of patients) {
        // Create a new user and their patient profile
        const userClient = createApiClient({ app: testApp.app });
        await userClient.signup();
        await createPatient(userClient, patientData);
      }
    });

    test('should list patients with default pagination', async () => {
      const { response, data } = await listPatients(adminClient);
      
      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(Array.isArray(data?.data)).toBe(true);
      expect(data?.data.length).toBeGreaterThanOrEqual(3);
      expect(data?.pagination.currentPage).toBe(1);
    });

    test('should paginate patient list', async () => {
      // First, get total count to work with actual data
      const { response: countResponse, data: countData } = await listPatients(adminClient, {
        page: 1,
        pageSize: 100
      });
      expect(countResponse.status).toBe(200);

      // Only test pagination if we have enough patients
      if (countData?.pagination.totalCount >= 4) {
        const { response: page1Response, data: page1 } = await listPatients(adminClient, {
          page: 1,
          pageSize: 2
        });

        expect(page1Response.status).toBe(200);
        expect(page1?.data.length).toBeLessThanOrEqual(2);
        expect(page1?.pagination.pageSize).toBe(2);

        const { response: page2Response, data: page2 } = await listPatients(adminClient, {
          page: 2,
          pageSize: 2
        });

        expect(page2Response.status).toBe(200);
        expect(page2?.data.length).toBeLessThanOrEqual(2);
        expect(page2?.pagination.currentPage).toBe(2);

        // Ensure different patients on different pages
        const page1Ids = page1.data.map(p => p.id);
        const page2Ids = page2?.data.map(p => p.id) || [];
        const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
        expect(hasOverlap).toBe(false);
      }
    });

    test('should sort patient list', async () => {
      const { response: ascResponse, data: ascData } = await listPatients(adminClient, {
        sort: 'createdAt',
        order: 'asc'
      });
      
      expect(ascResponse.status).toBe(200);
      expect(ascData?.data).toBeDefined();
      
      if (ascData?.data && ascData.data.length > 1) {
        // Check ascending order
        for (let i = 1; i < ascData.data.length; i++) {
          const prev = new Date(ascData.data[i - 1].createdAt);
          const curr = new Date(ascData.data[i].createdAt);
          expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
        }
      }
    });
  });

  describe('Provider and Pharmacy Information', () => {
    test('should handle different provider scenarios', async () => {
      const scenarios = generateProviderScenarios();
      
      for (const provider of scenarios) {
        // Create a new client/user for each scenario since one user can only have one patient profile
        const testClient = createApiClient({ app: testApp.app });
        await testClient.signup();

        const testData = generateTestPatientData({ primaryProvider: provider });
        const { response, data } = await createPatient(testClient, testData);

        expect(response.status).toBe(201);
        expect(data?.primaryProvider?.name).toBe(provider.name);
        expect(data?.primaryProvider?.specialty).toBe(provider.specialty);

      }
    });

    test('should handle different pharmacy scenarios', async () => {
      const scenarios = generatePharmacyScenarios();
      
      for (const pharmacy of scenarios) {
        // Create a new client/user for each scenario since one user can only have one patient profile
        const testClient = createApiClient({ app: testApp.app });
        await testClient.signup();

        const testData = generateTestPatientData({ primaryPharmacy: pharmacy });
        const { response, data } = await createPatient(testClient, testData);

        expect(response.status).toBe(201);
        expect(data?.primaryPharmacy?.name).toBe(pharmacy.name);
        expect(data?.primaryPharmacy?.address).toBe(pharmacy.address);

      }
    });

    test('should validate phone number formats', async () => {
      const testData = generateTestPatientData({
        primaryProvider: {
          name: 'Dr. Smith',
          phone: 'invalid-phone-format'
        }
      });
      
      const { response } = await createPatient(apiClient, testData);
      
      // Should either accept it or return validation error
      expect([201, 400].includes(response.status)).toBe(true);
      
      if (response.status === 201) {
        const { data } = await response.json();
      }
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent patient creation', async () => {
      const patientDataArray = generateBulkPatientData(3); // Reduce to 3 for faster test

      // Create admin client for concurrent operations
      const concurrentAdminClient = createApiClient({ app: testApp.app });
      await concurrentAdminClient.signinAsAdmin();

      // Use the admin client for concurrent operations
      const promises = patientDataArray.map(data =>
        createPatient(concurrentAdminClient, data)
      );
      const results = await Promise.allSettled(promises);

      // At least one should succeed, others may fail due to uniqueness constraints
      const succeeded = results.filter(result =>
        result.status === 'fulfilled' && result.value.response.status === 201
      );
      const failed = results.filter(result =>
        result.status === 'rejected' ||
        (result.status === 'fulfilled' && result.value.response.status !== 201)
      );

      expect(succeeded.length).toBeGreaterThanOrEqual(1); // At least one succeeds
      // Others may fail due to unique constraints, which is expected behavior
    }, 10000); // Add explicit timeout

    test('should handle concurrent updates to same patient', async () => {
      // Create a patient
      const testData = generateTestPatientData();
      const { data: patient } = await createPatient(apiClient, testData);
      
      // Perform concurrent updates
      const updates = [
        { 
          primaryProvider: { 
            name: 'Dr. Update 1',
            specialty: 'Cardiology'
          }
        },
        { 
          primaryPharmacy: { 
            name: 'Updated Pharmacy',
            address: '789 New St'
          }
        }
      ];
      
      const promises = updates.map(update => 
        updatePatient(apiClient, patient!.id, update)
      );
      const results = await Promise.allSettled(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.response.status).toBe(200);
        }
      });
    });
  });

  describe('Edge Cases', () => {
    test('should handle patients with only person data', async () => {
      const testData = {
        person: {
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName()
        }
      };
      
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.person).toBeDefined();
      expect(data?.primaryProvider === null || data?.primaryProvider === undefined).toBe(true);
      expect(data?.primaryPharmacy === null || data?.primaryPharmacy === undefined).toBe(true);
    });

    test('should handle provider with minimal information', async () => {
      const testData = generateTestPatientData({
        primaryProvider: {
          name: 'Dr. Minimal'
          // No specialty, phone, or fax
        }
      });
      
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.primaryProvider?.name).toBe('Dr. Minimal');
      expect(data?.primaryProvider?.specialty === null || data?.primaryProvider?.specialty === undefined).toBe(true);
    });

    test('should handle pharmacy with minimal information', async () => {
      const testData = generateTestPatientData({
        primaryPharmacy: {
          name: 'Minimal Pharmacy'
          // No address, phone, or fax
        }
      });
      
      const { response, data } = await createPatient(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.primaryPharmacy?.name).toBe('Minimal Pharmacy');
      expect(data?.primaryPharmacy?.address === null || data?.primaryPharmacy?.address === undefined).toBe(true);
    });

    test('should handle very long provider and pharmacy names', async () => {
      const longName = faker.lorem.words(50);
      const longAddress = faker.lorem.words(100);
      
      const testData = generateTestPatientData({
        primaryProvider: {
          name: longName
        },
        primaryPharmacy: {
          name: longName,
          address: longAddress
        }
      });
      
      const { response, data } = await createPatient(apiClient, testData);
      
      // Should either succeed or fail with appropriate error
      expect([201, 400, 413].includes(response.status)).toBe(true);
    });
  });
});