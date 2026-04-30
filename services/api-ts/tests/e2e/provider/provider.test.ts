/**
 * Provider Module E2E Tests
 * Tests the complete provider management workflow
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import {
  generateTestProviderData,
  generateMinimalProviderData,
  generateInvalidProviderData,
  generateBulkProviderData,
  generateProviderSearchScenarios,
  generateProviderTypeScenarios,
  createProvider,
  getProvider,
  getMyProvider,
  updateProvider,
  deleteProvider,
  listProviders,
  validateProviderResponse,
  type ProviderCreateRequest,
  type ProviderUpdateRequest,
  type ProviderResponse,
  type ProviderType
} from '../../helpers/provider';

describe('Provider Module E2E Tests', () => {
  let apiClient: ApiClient;
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });

    // Create API client with embedded app instance
    apiClient = createApiClient({ app: testApp.app });

    // Create and sign up a new user for this test
    await apiClient.signup();
  }, 30000);

  afterAll(async () => {
    await testApp?.cleanup();
  });
  
  beforeEach(async () => {
    // Create new API client for each test
    apiClient = createApiClient({ app: testApp.app });

    // Create and sign up a new user for this test
    await apiClient.signup();
  }, 30000);

  describe('Provider Creation', () => {
    test('should create provider with complete information', async () => {
      const testData = generateTestProviderData();

      const { response, data } = await createProvider(apiClient, testData);

      expect(response.status).toBe(201);
      expect(data).toBeDefined();
      expect(data?.id).toBeDefined();
      expect(data?.providerType).toBe(testData.providerType);
      expect(data?.yearsOfExperience).toBe(testData.yearsOfExperience);
      expect(data?.biography).toBe(testData.biography);
      expect(Array.isArray(data?.minorAilmentsSpecialties)).toBe(true);
      expect(Array.isArray(data?.minorAilmentsPracticeLocations)).toBe(true);
      expect(validateProviderResponse(data)).toBe(true);
    });

    test('should create provider with inline person data', async () => {
      const providerData = generateMinimalProviderData();
      
      const { response, data } = await createProvider(apiClient, providerData);
      
      expect(response.status).toBe(201);
      expect(data?.id).toBeDefined();
      expect(data?.person).toBeDefined(); // Person UUID reference
      expect(data?.providerType).toBe('pharmacist');
    });

    test('should create provider with minimal required fields', async () => {
      const testData = generateMinimalProviderData();
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.id).toBeDefined();
      expect(data?.providerType).toBe('pharmacist');
      expect(data?.person).toBeDefined(); // Person UUID reference
    });

    test('should validate provider type', async () => {
      const invalidData = generateInvalidProviderData();
      
      const { response } = await createProvider(apiClient, invalidData as any);
      
      expect(response.status).toBe(400);
    });

    test('should handle minor ailment specialties', async () => {
      const minorAilmentsSpecialties = [
        'Allergies and hay fever',
        'Cold sores',
        'Conjunctivitis (pink eye)',
        'Minor pain and fever'
      ];
      
      const testData = generateTestProviderData({ minorAilmentsSpecialties });
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.minorAilmentsSpecialties?.length).toBe(4);
      expect(data?.minorAilmentsSpecialties).toContain('Allergies and hay fever');
      expect(data?.minorAilmentsSpecialties).toContain('Cold sores');
    });

    test('should handle minor ailment practice locations', async () => {
      const minorAilmentsPracticeLocations = [
        'Community pharmacy',
        'Walk-in clinic',
        'Family practice'
      ];
      
      const testData = generateTestProviderData({ minorAilmentsPracticeLocations });
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.minorAilmentsPracticeLocations?.length).toBe(3);
      expect(data?.minorAilmentsPracticeLocations).toContain('Community pharmacy');
      expect(data?.minorAilmentsPracticeLocations).toContain('Walk-in clinic');
    });

    test('should handle years of experience', async () => {
      const testData = generateTestProviderData({
        yearsOfExperience: 15
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.yearsOfExperience).toBe(15);
    });

    test('should handle provider biography', async () => {
      const biography = 'Experienced healthcare provider with a focus on patient care and minor ailment treatment.';
      const testData = generateTestProviderData({
        biography
      });

      const { response, data } = await createProvider(apiClient, testData);

      expect(response.status).toBe(201);
      expect(data?.biography).toBe(biography);
    });

    test('should create provider with only providerType (auto-link to current user)', async () => {
      const { response, data } = await createProvider(apiClient, { providerType: 'pharmacist' } as ProviderCreateRequest);

      expect(response.status).toBe(201);
      expect(data?.id).toBeDefined();
      expect(data?.person).toBeDefined(); // Should be auto-set to user's person ID
      expect(data?.providerType).toBe('pharmacist');
    });
  });

  describe('Provider Retrieval', () => {

    test('should retrieve provider by ID', async () => {
      // Create a provider for retrieval tests
      const testProviderData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, testProviderData);
      const testProviderId = createdProvider!.id;

      const { response, data } = await getProvider(apiClient, testProviderId);
      
      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.id).toBe(testProviderId);
      expect(data?.providerType).toBe(testProviderData.providerType);
      expect(data?.person).toBeDefined(); // Person UUID reference
      expect(validateProviderResponse(data)).toBe(true);
    });

    test('should include provider details in retrieval', async () => {
      // Create a provider for retrieval tests
      const testProviderData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, testProviderData);
      const testProviderId = createdProvider!.id;

      const { response, data } = await getProvider(apiClient, testProviderId);
      
      expect(response.status).toBe(200);
      expect(typeof data?.yearsOfExperience === 'number' || data?.yearsOfExperience === null).toBe(true);
      expect(typeof data?.biography === 'string' || data?.biography === null).toBe(true);
      expect(Array.isArray(data?.minorAilmentsSpecialties) || data?.minorAilmentsSpecialties === null).toBe(true);
      expect(Array.isArray(data?.minorAilmentsPracticeLocations) || data?.minorAilmentsPracticeLocations === null).toBe(true);
    });

    test('should return 404 for non-existent provider', async () => {
      const fakeId = faker.string.uuid();
      
      const { response } = await getProvider(apiClient, fakeId);
      
      expect(response.status).toBe(404);
    });
  });

  describe('Provider /me Endpoint', () => {
    test('should retrieve current user\'s provider profile via /providers/me', async () => {
      // Create provider profile for current user
      const testData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, testData);

      // Retrieve via /providers/me
      const { response, data } = await getMyProvider(apiClient);

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.id).toBe(createdProvider!.id);
      expect(data?.providerType).toBe(testData.providerType);
      expect(validateProviderResponse(data)).toBe(true);
    });

    test('should return 404 when user has no provider profile', async () => {
      // Create a new user with no provider profile
      const newApiClient = createApiClient({ app: testApp.app });
      await newApiClient.signup();

      // Try to get /providers/me - should fail
      const { response } = await getMyProvider(newApiClient);

      expect(response.status).toBe(404);
    });

    test('should include person details when expand=person', async () => {
      // Create provider profile for current user
      const testData = generateTestProviderData();
      await createProvider(apiClient, testData);

      // Retrieve via /providers/me with expand
      const { response, data } = await getMyProvider(apiClient, {
        expand: ['person']
      });

      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.person).toBeDefined();
      // When expanded, person should be an object, not just a UUID string
      if (typeof data?.person === 'object') {
        expect(data.person).toHaveProperty('firstName');
        expect(data.person).toHaveProperty('id');
      }
    });

    test('should work after provider creation workflow', async () => {
      // Simulate complete workflow: signup -> create provider -> get /me
      const newApiClient = createApiClient({ app: testApp.app });
      const user = await newApiClient.signup();

      // Create provider profile
      const testData = generateTestProviderData({
        providerType: 'pharmacist',
        yearsOfExperience: 10,
        biography: 'Test provider for workflow test'
      });
      const { data: createdProvider } = await createProvider(newApiClient, testData);

      // Get via /providers/me
      const { response, data } = await getMyProvider(newApiClient);

      expect(response.status).toBe(200);
      expect(data?.id).toBe(createdProvider!.id);
      expect(data?.providerType).toBe('pharmacist');
      expect(data?.yearsOfExperience).toBe(10);
      expect(data?.biography).toBe('Test provider for workflow test');
    });
  });

  describe('Provider Update', () => {

    test('should update provider years of experience', async () => {
      // Create a provider for update tests
      const originalData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, originalData);
      const testProviderId = createdProvider!.id;

      const updateData: ProviderUpdateRequest = {
        yearsOfExperience: 20
      };
      
      const { response, data } = await updateProvider(apiClient, testProviderId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.yearsOfExperience).toBe(20);
    });

    test('should update biography', async () => {
      // Create a provider for update tests
      const originalData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, originalData);
      const testProviderId = createdProvider!.id;

      const newBio = 'Updated professional biography focusing on patient care and minor ailment treatment.';
      const updateData: ProviderUpdateRequest = {
        biography: newBio
      };
      
      const { response, data } = await updateProvider(apiClient, testProviderId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.biography).toBe(newBio);
    });

    test('should update minor ailments specialties', async () => {
      // Create a provider for update tests
      const originalData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, originalData);
      const testProviderId = createdProvider!.id;

      const updateData: ProviderUpdateRequest = {
        minorAilmentsSpecialties: ['Cold sores', 'Minor pain and fever', 'Urinary tract infections']
      };
      
      const { response, data } = await updateProvider(apiClient, testProviderId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.minorAilmentsSpecialties).toContain('Cold sores');
      expect(data?.minorAilmentsSpecialties).toContain('Minor pain and fever');
      expect(data?.minorAilmentsSpecialties).toContain('Urinary tract infections');
    });

    test('should update minor ailment practice locations', async () => {
      // Create a provider for update tests
      const originalData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, originalData);
      const testProviderId = createdProvider!.id;

      const updateData: ProviderUpdateRequest = {
        minorAilmentsPracticeLocations: ['Community pharmacy', 'Telehealth platform']
      };
      
      const { response, data } = await updateProvider(apiClient, testProviderId, updateData);
      
      expect(response.status).toBe(200);
      expect(data?.minorAilmentsPracticeLocations).toContain('Community pharmacy');
      expect(data?.minorAilmentsPracticeLocations).toContain('Telehealth platform');
    });

    test('should validate update data', async () => {
      // Create a provider for update tests
      const originalData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, originalData);
      const testProviderId = createdProvider!.id;

      const updateData = {
        yearsOfExperience: -5 // Invalid negative years
      };
      
      const { response } = await updateProvider(apiClient, testProviderId, updateData as any);
      
      expect(response.status).toBe(400);
    });

    test('should return 404 when updating non-existent provider', async () => {
      const fakeId = faker.string.uuid();
      const updateData: ProviderUpdateRequest = {
        yearsOfExperience: 10
      };

      const { response } = await updateProvider(apiClient, fakeId, updateData);

      expect(response.status).toBe(404); // Provider doesn't exist
    });
  });

  describe('Provider Deletion', () => {
    test('should delete provider', async () => {
      // Create a provider
      const testData = generateTestProviderData();
      const { data: createdProvider } = await createProvider(apiClient, testData);
      
      // Delete the provider
      const { response } = await deleteProvider(apiClient, createdProvider!.id);
      
      expect(response.status).toBe(204);
      
      // Verify provider is deleted
      const { response: getResponse } = await getProvider(apiClient, createdProvider!.id);
      expect(getResponse.status).toBe(404);
    });

    test('should return 404 when deleting non-existent provider', async () => {
      const fakeId = faker.string.uuid();

      const { response } = await deleteProvider(apiClient, fakeId);

      expect(response.status).toBe(404); // Provider doesn't exist
    });
  });

  describe('Provider Listing and Search', () => {

    test('should list providers with default pagination', async () => {
      // Create multiple providers with different characteristics
      const providers = [
        generateTestProviderData({
          providerType: 'pharmacist',
          yearsOfExperience: 15,
          minorAilmentsSpecialties: ['Allergies and hay fever', 'Cold sores']
        }),
        generateTestProviderData({
          providerType: 'nurse-practitioner',
          yearsOfExperience: 8,
          minorAilmentsSpecialties: ['Minor cuts and scrapes', 'Sprains and strains']
        }),
        generateTestProviderData({
          providerType: 'pharmacist',
          yearsOfExperience: 12,
          minorAilmentsSpecialties: ['Allergies and hay fever', 'Minor pain and fever']
        })
      ];
      
      // Create separate users for each provider since users can only have one provider profile
      for (const providerData of providers) {
        const newApiClient = createApiClient({ app: testApp.app });
        await newApiClient.signup();
        await createProvider(newApiClient, providerData);
      }

      const { response, data } = await listProviders(apiClient);
      
      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(Array.isArray(data?.data)).toBe(true);
      expect(data?.data.length).toBeGreaterThanOrEqual(3);
      expect(data?.pagination.currentPage).toBe(1);
    });

    test('should return providers in response format', async () => {
      // Create test providers with separate users
      const pharmacistClient = createApiClient({ app: testApp.app });
      await pharmacistClient.signup();
      await createProvider(pharmacistClient, generateTestProviderData({ providerType: 'pharmacist' }));

      const { response, data } = await listProviders(apiClient);
      
      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(Array.isArray(data?.data)).toBe(true);
      
      // Verify each provider has the expected structure
      if (data?.data && data.data.length > 0) {
        data.data.forEach(provider => {
          expect(validateProviderResponse(provider)).toBe(true);
        });
      }
    });

    test('should support pagination parameters', async () => {
      // Create test providers to ensure we have enough data for pagination
      const client1 = createApiClient({ app: testApp.app });
      await client1.signup();
      await createProvider(client1, generateTestProviderData({ yearsOfExperience: 5 }));

      const { response, data } = await listProviders(apiClient, {
        limit: 1,
        offset: 0
      });
      
      expect(response.status).toBe(200);
      expect(data).toBeDefined();
      expect(data?.pagination).toBeDefined();
      expect(data?.pagination.limit).toBe(1);
      expect(data?.pagination.offset).toBe(0);
    });

    test('should support specialty filter parameter', async () => {
      // Create test provider with specific specialty
      const client1 = createApiClient({ app: testApp.app });
      await client1.signup();
      await createProvider(client1, generateTestProviderData({ 
        minorAilmentsSpecialties: ['Allergies and hay fever', 'Cold sores'] 
      }));

      // Test that the API accepts specialty parameter (actual filtering implementation may vary)
      const { response } = await listProviders(apiClient, {
        specialty: 'Allergies and hay fever'
      });
      
      expect(response.status).toBe(200);
      // Note: The actual filtering behavior depends on backend implementation
      // This test just verifies the parameter is accepted
    });

    test('should support query search parameter', async () => {
      // Create test provider
      const client1 = createApiClient({ app: testApp.app });
      await client1.signup();
      await createProvider(client1, generateTestProviderData({
        providerType: 'pharmacist',
        yearsOfExperience: 12,
        minorAilmentsSpecialties: ['Allergies and hay fever', 'Minor pain and fever']
      }));

      // Test that the API accepts query parameter
      const { response } = await listProviders(apiClient, {
        q: 'pharmacist'
      });
      
      expect(response.status).toBe(200);
      // Note: The actual search behavior depends on backend implementation
      // This test just verifies the parameter is accepted
    });

    test('should paginate provider list', async () => {
      // Create several providers for pagination test using separate users
      for (let i = 0; i < 3; i++) { // Reduced to 3 to avoid too many users
        const client = createApiClient({ app: testApp.app });
        await client.signup();
        await createProvider(client, generateTestProviderData());
      }

      const { response: page1Response, data: page1 } = await listProviders(apiClient, {
        limit: 2,
        offset: 0
      });
      
      expect(page1Response.status).toBe(200);
      expect(page1?.data.length).toBeLessThanOrEqual(2);
      
      if (page1?.pagination.hasNextPage) {
        const { response: page2Response, data: page2 } = await listProviders(apiClient, {
          limit: 2,
          offset: 2
        });
        
        expect(page2Response.status).toBe(200);
        expect(page2?.pagination.currentPage).toBe(2);
        
        // Ensure different providers on different pages
        const page1Ids = page1.data.map(p => p.id);
        const page2Ids = page2?.data.map(p => p.id) || [];
        const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
        expect(hasOverlap).toBe(false);
      }
    });

    test('should test search scenarios', async () => {
      const scenarios = generateProviderSearchScenarios();
      
      for (const scenario of scenarios) {
        const { response, data } = await listProviders(apiClient, scenario.params);
        
        expect(response.status).toBe(200);
        expect(data).toBeDefined();
        // Results should match the search criteria
      }
    });
  });

  describe('Provider Experience and Biography', () => {
    test('should track years of experience', async () => {
      const testData = generateTestProviderData({
        yearsOfExperience: 15
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.yearsOfExperience).toBe(15);
      
      if (data?.id) {
        // Update years of experience
        const updateData = { yearsOfExperience: 16 };
        const { data: updated } = await updateProvider(apiClient, data.id, updateData);
        
        expect(updated?.yearsOfExperience).toBe(16);
      }
    });

    test('should handle detailed biography', async () => {
      const biography = 'Dr. Smith has extensive experience in treating minor ailments and providing patient-centered care. Specializing in community pharmacy practice and telehealth consultations.';
      const testData = generateTestProviderData({
        biography
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.biography).toBe(biography);
    });

    test('should handle providers with no experience specified', async () => {
      const testData = generateTestProviderData({
        yearsOfExperience: undefined
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.yearsOfExperience === null || data?.yearsOfExperience === undefined).toBe(true);
    });
  });

  describe('Provider Type Validation', () => {
    test('should create different provider types', async () => {
      const providerTypes: ProviderType[] = [
        'pharmacist',
        'other'
      ];
      
      // Test first few provider types to avoid creating too many users
      const typesToTest = providerTypes.slice(0, 3);
      
      for (const providerType of typesToTest) {
        // Create a new user for each provider type since users can only have one provider profile
        const newApiClient = createApiClient({ app: testApp.app });
        await newApiClient.signup();
        
        const testData = generateMinimalProviderData();
        testData.providerType = providerType;
        
        const { response, data } = await createProvider(newApiClient, testData);
        
        expect(response.status).toBe(201);
        expect(data?.providerType).toBe(providerType);
      }
    });

    test('should test provider type scenarios', async () => {
      const scenarios = generateProviderTypeScenarios();
      
      // Test first two scenarios to avoid creating too many users
      const scenariosToTest = scenarios.slice(0, 2);
      
      for (const scenario of scenariosToTest) {
        // Create a new user for each scenario since users can only have one provider profile
        const newApiClient = createApiClient({ app: testApp.app });
        await newApiClient.signup();
        
        const testData = generateTestProviderData({
          providerType: scenario.providerType,
          minorAilmentsSpecialties: scenario.expectedSpecialties
        });
        
        const { response, data } = await createProvider(newApiClient, testData);
        
        expect(response.status).toBe(201);
        expect(data?.providerType).toBe(scenario.providerType);
        expect(data?.minorAilmentsSpecialties).toEqual(expect.arrayContaining(scenario.expectedSpecialties.slice(0, 3)));
      }
    });

    test('should reject invalid provider types', async () => {
      const testData = generateTestProviderData({
        providerType: 'invalid_type' as any
      });
      
      const { response } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(400);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent provider creation', async () => {
      const providerDataArray = generateBulkProviderData(3); // Reduce to 3 to avoid too many users
      
      // Create separate users since each user can only have one provider profile
      const apiClients = await Promise.all(
        providerDataArray.map(async () => {
          const client = createApiClient({ app: testApp.app });
          await client.signup();
          return client;
        })
      );
      
      const promises = providerDataArray.map((data, index) => 
        createProvider(apiClients[index], data)
      );
      const results = await Promise.allSettled(promises);
      
      // All should succeed
      results.forEach(result => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.response.status).toBe(201);
        }
      });
    });

    test('should handle concurrent updates to same provider', async () => {
      // Create a provider
      const testData = generateTestProviderData();
      const { data: provider } = await createProvider(apiClient, testData);
      
      // Perform concurrent updates
      const updates = [
        { yearsOfExperience: 20 },
        { biography: 'Updated biography' },
        { minorAilmentsSpecialties: ['Cold sores', 'Minor pain and fever'] }
      ];
      
      const promises = updates.map(update => 
        updateProvider(apiClient, provider!.id, update)
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
    test('should handle providers with no specialties', async () => {
      const testData = generateTestProviderData({
        minorAilmentsSpecialties: []
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.minorAilmentsSpecialties).toEqual([]);
    });

    test('should handle very long biography text', async () => {
      const testData = generateTestProviderData({
        biography: faker.lorem.paragraphs(50) // Very long biography
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      // Should either succeed or fail with appropriate error
      expect([201, 400, 413].includes(response.status)).toBe(true);
    });

    test('should handle providers with many practice locations', async () => {
      const manyLocations = [
        'Community pharmacy',
        'Walk-in clinic',
        'Family practice',
        'Urgent care center',
        'Retail health clinic',
        'Telehealth platform',
        'Mobile clinic'
      ];
      
      const testData = generateTestProviderData({
        minorAilmentsPracticeLocations: manyLocations
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.minorAilmentsPracticeLocations?.length).toBe(7);
    });

    test('should handle providers with maximum years of experience', async () => {
      const testData = generateTestProviderData({
        yearsOfExperience: 50 // Very experienced
      });
      
      const { response, data } = await createProvider(apiClient, testData);
      
      expect(response.status).toBe(201);
      expect(data?.yearsOfExperience).toBe(50);
    });
  });
});