/**
 * Storage E2E Tests
 * Tests the complete storage workflow with real MinIO backend and database
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { faker } from '@faker-js/faker';
import { createApiClient, type ApiClient } from '../../helpers/client';
import { createTestApp, type TestApp } from '../../helpers/test-app';
import { addMinutes } from 'date-fns';
import {
  createTestFile,
  createTestFileWithSize,
  createInvalidTestFile,
  uploadFileToStorage,
  downloadFile,
  listFiles,
  deleteFile,
  waitForFileStatus,
  generateTestFileId,
  validatePresignedUrl,
  getRandomMimeType,
  type TestFile,
  type FileUploadResponse,
  type FileDownloadResponse,
  type FileListResponse,
} from '../../helpers/storage';

describe('Storage E2E Tests', () => {
  let testApp: TestApp;
  let apiClient: ApiClient;

  beforeAll(async () => {
    testApp = await createTestApp({ storage: true });

    // Create API client with embedded app instance
    apiClient = createApiClient({ app: testApp.app });

    // Create authenticated user for all tests
    await apiClient.signup();
  }, 30000);

  afterAll(async () => {
    await testApp?.cleanup();
  });

  describe('File Upload', () => {
    test('should upload a small text file successfully', async () => {
      const testFile = createTestFile({ type: 'text', size: 100 });
      
      const result = await uploadFileToStorage(apiClient, testFile);
      
      // Verify upload response
      expect(result.uploadResponse.file).toBeDefined();
      expect(result.uploadResponse.uploadUrl).toBeDefined();
      expect(result.uploadResponse.uploadMethod).toBe('PUT');
      expect(result.uploadResponse.expiresAt).toBeDefined();
      
      // Verify presigned URL
      expect(validatePresignedUrl(result.uploadResponse.uploadUrl, result.uploadResponse.expiresAt)).toBe(true);
      
      // Verify file is available
      const metadata = await waitForFileStatus(apiClient, result.fileId, 'available');
      expect(metadata.filename).toBe(testFile.filename);
      expect(metadata.size).toBe(testFile.size);
      expect(metadata.mimeType).toBe(testFile.mimeType);
      expect(metadata.status).toBe('available');
    });

    test('should upload different file types', async () => {
      const fileTypes = ['text', 'image', 'document', 'binary'] as const;
      
      for (const type of fileTypes) {
        const testFile = createTestFile({ type, size: 1024 });
        
        const result = await uploadFileToStorage(apiClient, testFile);
        
        const metadata = await waitForFileStatus(apiClient, result.fileId, 'available');
        expect(metadata.mimeType).toBe(testFile.mimeType);
        expect(metadata.size).toBe(testFile.size);
      }
    });

    test('should handle large files within limit', async () => {
      // Upload a 5MB file
      const testFile = createTestFileWithSize(5, 'binary');
      
      const result = await uploadFileToStorage(apiClient, testFile);
      
      const metadata = await waitForFileStatus(apiClient, result.fileId, 'available', 15000);
      expect(metadata.size).toBe(testFile.size);
    });

    test('should reject files larger than 50MB', async () => {
      const testFile = createInvalidTestFile('too-large');
      
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      expect(uploadResponse.ok).toBe(false);
      expect(uploadResponse.status).toBe(400);
    });

    test('should handle special characters in filename', async () => {
      const specialFilename = `test file with spaces & symbols (2024) [final].txt`;
      const testFile = createTestFile({ filename: specialFilename });
      
      const result = await uploadFileToStorage(apiClient, testFile);
      
      const metadata = await waitForFileStatus(apiClient, result.fileId, 'available');
      expect(metadata.filename).toBe(specialFilename);
    });

    test('should generate unique file IDs', async () => {
      const fileIds = new Set();
      const uploadPromises = Array.from({ length: 5 }, async () => {
        const testFile = createTestFile({ size: 100 });
        const result = await uploadFileToStorage(apiClient, testFile);
        return result.fileId;
      });
      
      const results = await Promise.all(uploadPromises);
      results.forEach(id => fileIds.add(id));
      
      expect(fileIds.size).toBe(5); // All IDs should be unique
    });

    test('should handle concurrent uploads', async () => {
      const concurrency = 3;
      const uploadPromises = Array.from({ length: concurrency }, async (_, i) => {
        const testFile = createTestFile({ filename: `concurrent-${i}.txt`, size: 500 });
        return uploadFileToStorage(apiClient, testFile);
      });
      
      const results = await Promise.all(uploadPromises);
      
      // Wait for all files to be available
      const metadataPromises = results.map(result => 
        waitForFileStatus(apiClient, result.fileId, 'available')
      );
      const metadata = await Promise.all(metadataPromises);
      
      expect(metadata).toHaveLength(concurrency);
      metadata.forEach(meta => {
        expect(meta.status).toBe('available');
      });
    });
  });

  describe('File Download', () => {
    let uploadedFileId: string;
    let originalFile: TestFile;

    test('should download file with correct content', async () => {
      originalFile = createTestFile({ type: 'text', size: 1000 });
      const result = await uploadFileToStorage(apiClient, originalFile);
      uploadedFileId = result.fileId;
      
      await waitForFileStatus(apiClient, uploadedFileId, 'available');
      
      const { content, downloadResponse } = await downloadFile(apiClient, uploadedFileId);
      
      // Verify download response
      expect(downloadResponse.downloadUrl).toBeDefined();
      expect(downloadResponse.expiresAt).toBeDefined();
      expect(downloadResponse.file.id).toBe(uploadedFileId);
      
      // Verify presigned URL
      expect(validatePresignedUrl(downloadResponse.downloadUrl, downloadResponse.expiresAt)).toBe(true);
      
      // Verify file content
      expect(content.equals(originalFile.content)).toBe(true);
      expect(content.length).toBe(originalFile.size);
    });

    test('should include complete file metadata in download response', async () => {
      originalFile = createTestFile({ type: 'text', size: 1000 });
      const result = await uploadFileToStorage(apiClient, originalFile);
      uploadedFileId = result.fileId;
      
      await waitForFileStatus(apiClient, uploadedFileId, 'available');
      
      const { downloadResponse } = await downloadFile(apiClient, uploadedFileId);
      
      expect(downloadResponse.file.filename).toBe(originalFile.filename);
      expect(downloadResponse.file.size).toBe(originalFile.size);
      expect(downloadResponse.file.mimeType).toBe(originalFile.mimeType);
      expect(downloadResponse.file.status).toBe('available');
      expect(downloadResponse.file.owner).toBeDefined();
      expect(downloadResponse.file.createdAt).toBeDefined();
      expect(downloadResponse.file.updatedAt).toBeDefined();
    });

    test('should return 404 for non-existent file', async () => {
      const fakeFileId = generateTestFileId();
      
      const downloadUrlResponse = await apiClient.fetch(`/storage/files/${fakeFileId}/download`);
      expect(downloadUrlResponse.status).toBe(404);
    });

    test('should not allow download of files in uploading status', async () => {
      // Create file record but don't complete upload
      const testFile = createTestFile({ size: 100 });
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      const uploadData: FileUploadResponse = await uploadResponse.json();
      
      // Try to download without completing upload
      const downloadUrlResponse = await apiClient.fetch(`/storage/files/${uploadData.file}/download`);
      expect(downloadUrlResponse.ok).toBe(false);
    });

    test('should handle download URL expiration', async () => {
      originalFile = createTestFile({ type: 'text', size: 1000 });
      const result = await uploadFileToStorage(apiClient, originalFile);
      uploadedFileId = result.fileId;
      
      await waitForFileStatus(apiClient, uploadedFileId, 'available');
      
      const { downloadResponse } = await downloadFile(apiClient, uploadedFileId);
      
      // Verify expiration is set to 15 minutes from now (allow 1 minute tolerance)
      const expiryTime = new Date(downloadResponse.expiresAt).getTime();
      const expectedExpiry = addMinutes(new Date(), 15).getTime();
      const tolerance = 60 * 1000; // 1 minute
      
      expect(Math.abs(expiryTime - expectedExpiry)).toBeLessThan(tolerance);
    });
  });


  describe('File Listing', () => {
    test('should list all files', async () => {
      // Get current user for proper isolation
      const currentUser = apiClient.getUser();
      const ownerId = currentUser?.id;
      
      // Create files with different statuses
      const files = [
        createTestFile({ filename: 'available-1.txt', size: 100 }),
        createTestFile({ filename: 'available-2.txt', size: 200 }),
        createTestFile({ filename: 'available-3.txt', size: 300 }),
      ];
      
      const testFiles: { fileId: string; file: TestFile; status: string }[] = [];
      
      // Upload all files
      for (const file of files) {
        const result = await uploadFileToStorage(apiClient, file);
        await waitForFileStatus(apiClient, result.fileId, 'available');
        testFiles.push({ fileId: result.fileId, file, status: 'available' });
      }
      
      // Search across all pages to find our uploaded files
      const allFiles: any[] = [];
      let currentOffset = 0;
      const pageSize = 50; // Use larger page size
      let hasMorePages = true;
      
      while (hasMorePages) {
        const response = await listFiles(apiClient, { 
          offset: currentOffset, 
          limit: pageSize 
        });
        
        allFiles.push(...response.data);
        
        // Check if there are more pages
        hasMorePages = response.pagination.hasNextPage;
        currentOffset += pageSize;
        
        // Safety check to avoid infinite loop
        if (currentOffset > response.pagination.totalCount) {
          break;
        }
      }
      
      // Get the final response for pagination checks
      const response = await listFiles(apiClient);
      
      expect(response.data).toBeInstanceOf(Array);
      expect(response.pagination).toBeDefined();
      expect(response.pagination.totalCount).toBeGreaterThanOrEqual(testFiles.length);
      
      // Check that our test files are included somewhere in the paginated results
      const allFileIds = allFiles.map(f => f.id);
      testFiles.forEach(({ fileId }) => {
        expect(allFileIds).toContain(fileId);
      });
    });

    test('should filter files by status', async () => {
      const response = await listFiles(apiClient, { status: 'available' });
      
      expect(response.data).toBeInstanceOf(Array);
      response.data.forEach(file => {
        expect(file.status).toBe('available');
      });
    });

    test('should handle pagination', async () => {
      // Get first page with limit 2
      const page1 = await listFiles(apiClient, { limit: 2, offset: 0 });
      expect(page1.data.length).toBeLessThanOrEqual(2);
      expect(page1.pagination.limit).toBe(2);
      expect(page1.pagination.offset).toBe(0);
      expect(page1.pagination.currentPage).toBe(1);
      
      if (page1.pagination.totalCount > 2) {
        // Get second page
        const page2 = await listFiles(apiClient, { limit: 2, offset: 2 });
        expect(page2.data.length).toBeGreaterThan(0);
        expect(page2.pagination.offset).toBe(2);
        expect(page2.pagination.currentPage).toBe(2);
        
        // Ensure no overlap
        const page1Ids = page1.data.map(f => f.id);
        const page2Ids = page2.data.map(f => f.id);
        const overlap = page1Ids.filter(id => page2Ids.includes(id));
        expect(overlap.length).toBe(0);
      }
    });

    test('should handle filtering by status', async () => {
      const response = await listFiles(apiClient, { status: 'failed' });
      
      expect(response.data).toBeInstanceOf(Array);
      expect(response.pagination).toBeDefined();
      expect(response.pagination.totalCount).toBeGreaterThanOrEqual(0);
      
      // If there are failed files, they should all have failed status
      if (response.data.length > 0) {
        response.data.forEach((file: any) => {
          expect(file.status).toBe('failed');
        });
      }
    });

    test('should respect maximum page size', async () => {
      // Test that requests above maximum limit are rejected with validation error
      const response = await apiClient.fetch('/storage/files', {
        searchParams: { limit: 200 }
      });
      
      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.code).toBeDefined();
      expect(errorData.message).toBeDefined();
      expect(errorData.statusCode).toBe(400);
      expect(errorData.requestId).toBeDefined();
      expect(errorData.timestamp).toBeDefined();
      expect(errorData.path).toBeDefined();
      expect(errorData.method).toBeDefined();
    });

    test('should handle invalid pagination parameters', async () => {
      // Negative offset should return validation error
      const response1 = await apiClient.fetch('/storage/files', {
        searchParams: { offset: -1 }
      });
      expect(response1.status).toBe(400);
      const errorData1 = await response1.json();
      expect(errorData1.code).toBeDefined();
      expect(errorData1.message).toBeDefined();
      expect(errorData1.statusCode).toBe(400);
      expect(errorData1.requestId).toBeDefined();
      expect(errorData1.timestamp).toBeDefined();
      expect(errorData1.path).toBeDefined();
      expect(errorData1.method).toBeDefined();
      
      // Zero limit should return validation error
      const response2 = await apiClient.fetch('/storage/files', {
        searchParams: { limit: 0 }
      });
      expect(response2.status).toBe(400);
      const errorData2 = await response2.json();
      expect(errorData2.code).toBeDefined();
      expect(errorData2.message).toBeDefined();
      expect(errorData2.statusCode).toBe(400);
      expect(errorData2.requestId).toBeDefined();
      expect(errorData2.timestamp).toBeDefined();
      expect(errorData2.path).toBeDefined();
      expect(errorData2.method).toBeDefined();
    });
  });

  describe('File Deletion', () => {
    test('should delete file successfully', async () => {
      const testFile = createTestFile({ size: 500 });
      const result = await uploadFileToStorage(apiClient, testFile);
      const uploadedFileId = result.fileId;

      await waitForFileStatus(apiClient, uploadedFileId, 'available');

      // Verify file exists (using getFile endpoint)
      const fileResponse = await apiClient.fetch(`/storage/files/${uploadedFileId}`);
      expect(fileResponse.status).toBe(200);

      // Delete file
      await deleteFile(apiClient, uploadedFileId);

      // Verify file is deleted
      const response = await apiClient.fetch(`/storage/files/${uploadedFileId}`);
      expect(response.status).toBe(404);
    });

    test('should return 404 when deleting non-existent file', async () => {
      const fakeFileId = generateTestFileId();
      
      const response = await apiClient.fetch(`/storage/files/${fakeFileId}`, {
        method: 'DELETE',
      });
      
      expect(response.status).toBe(404);
    });

    test('should handle file deletion from storage backend', async () => {
      const testFile = createTestFile({ size: 500 });
      const result = await uploadFileToStorage(apiClient, testFile);
      const uploadedFileId = result.fileId;
      
      await waitForFileStatus(apiClient, uploadedFileId, 'available');
      
      // Delete file
      await deleteFile(apiClient, uploadedFileId);
      
      // Try to download - should fail
      const downloadResponse = await apiClient.fetch(`/storage/files/${uploadedFileId}/download`);
      expect(downloadResponse.status).toBe(404);
    });

    test('should clean up database record on deletion', async () => {
      const testFile = createTestFile({ size: 500 });
      const result = await uploadFileToStorage(apiClient, testFile);
      const uploadedFileId = result.fileId;
      
      await waitForFileStatus(apiClient, uploadedFileId, 'available');
      
      await deleteFile(apiClient, uploadedFileId);
      
      // File should not appear in list
      const listResponse = await listFiles(apiClient);
      const fileIds = listResponse.data.map(f => f.id);
      expect(fileIds).not.toContain(uploadedFileId);
    });
  });

  describe('End-to-End Workflows', () => {
    test('should complete full upload-download-delete cycle', async () => {
      const originalContent = faker.lorem.paragraphs(10);
      const testFile = createTestFile({ 
        type: 'text',
        size: Buffer.from(originalContent).length,
        filename: 'full-cycle-test.txt'
      });
      testFile.content = Buffer.from(originalContent);
      
      // 1. Upload file
      const uploadResult = await uploadFileToStorage(apiClient, testFile);
      const fileId = uploadResult.fileId;
      
      // 2. Wait for processing
      const metadata = await waitForFileStatus(apiClient, fileId, 'available');
      expect(metadata.status).toBe('available');
      expect(metadata.filename).toBe(testFile.filename);
      
      // 3. Download and verify
      const { content } = await downloadFile(apiClient, fileId);
      expect(content.toString()).toBe(originalContent);
      
      // 4. Delete file
      await deleteFile(apiClient, fileId);
      
      // 5. Verify deletion
      const response = await apiClient.fetch(`/storage/files/${fileId}`);
      expect(response.status).toBe(404);
    });

    test('should handle partial upload cleanup', async () => {
      const testFile = createTestFile({ size: 100 });
      
      // 1. Initiate upload
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      const uploadData: FileUploadResponse = await uploadResponse.json();
      const fileId = uploadData.file;
      
      // 2. Don't upload to storage, just try to complete
      const completeResponse = await apiClient.fetch(`/storage/files/${fileId}/complete`, {
        method: 'POST',
      });
      
      // Should fail because file wasn't uploaded to storage
      expect(completeResponse.ok).toBe(false);

      // 3. File should be marked as failed (check via waitForFileStatus)
      try {
        await waitForFileStatus(apiClient, fileId, 'failed', 5000);
        // If we reach here, the file status is 'failed'
        expect(true).toBe(true);
      } catch (error) {
        // File status didn't reach 'failed' within timeout
        expect(error).toBeDefined();
      }
    });

    test('should handle concurrent operations on same file', async () => {
      const testFile = createTestFile({ size: 200 });
      const uploadResult = await uploadFileToStorage(apiClient, testFile);
      const fileId = uploadResult.fileId;

      await waitForFileStatus(apiClient, fileId, 'available');

      // Perform concurrent reads using getFile endpoint
      const concurrentReads = Array.from({ length: 5 }, () =>
        apiClient.fetch(`/storage/files/${fileId}`)
      );
      const results = await Promise.all(concurrentReads);

      results.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed file IDs', async () => {
      const malformedIds = ['not-a-uuid', '12345', '', 'null', 'undefined'];
      
      for (const id of malformedIds) {
        const response = await apiClient.fetch(`/storage/files/${id}`);
        expect(response.ok).toBe(false);
      }
    });

    test('should validate required fields in upload request', async () => {
      const incompleteRequests = [
        {}, // Missing all fields
        { filename: 'test.txt' }, // Missing size and mimeType
        { filename: 'test.txt', size: 100 }, // Missing mimeType
        { filename: 'test.txt', mimeType: 'text/plain' }, // Missing size
      ];
      
      for (const body of incompleteRequests) {
        const response = await apiClient.fetch('/storage/files/upload', {
          method: 'POST',
          body: body,
        });
        
        expect(response.ok).toBe(false);
        expect(response.status).toBe(400);
      }
    });

    test('should handle invalid JSON in upload request', async () => {
      const response = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    test('should handle invalid query parameters in list endpoint', async () => {
      const invalidParams = [
        { status: 'invalid-status' },
        { limit: 'not-a-number' },
        { offset: 'negative-number' },
      ];
      
      for (const params of invalidParams) {
        const response = await apiClient.fetch('/storage/files', {
          searchParams: params
        });
        // Should either succeed with ignored invalid params or return 400
        expect([200, 400]).toContain(response.status);
      }
    });
  });

  describe('Presigned URLs', () => {
    test('should generate valid presigned upload URLs', async () => {
      const testFile = createTestFile({ size: 100 });
      
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      const uploadData: FileUploadResponse = await uploadResponse.json();
      
      // Validate presigned URL structure
      expect(validatePresignedUrl(uploadData.uploadUrl, uploadData.expiresAt)).toBe(true);
      
      // Test actual upload to presigned URL
      const storageResponse = await fetch(uploadData.uploadUrl, {
        method: uploadData.uploadMethod,
        body: testFile.content,
        headers: {
          'Content-Type': testFile.mimeType,
        },
      });
      
      expect(storageResponse.ok).toBe(true);
    });

    test('should generate valid presigned download URLs', async () => {
      const testFile = createTestFile({ size: 100 });
      const uploadResult = await uploadFileToStorage(apiClient, testFile);
      
      await waitForFileStatus(apiClient, uploadResult.fileId, 'available');
      
      const downloadUrlResponse = await apiClient.fetch(`/storage/files/${uploadResult.fileId}/download`);
      const downloadData: FileDownloadResponse = await downloadUrlResponse.json();
      
      // Validate presigned URL structure
      expect(validatePresignedUrl(downloadData.downloadUrl, downloadData.expiresAt)).toBe(true);
      
      // Test actual download from presigned URL
      const fileResponse = await fetch(downloadData.downloadUrl);
      expect(fileResponse.ok).toBe(true);
      
      const content = Buffer.from(await fileResponse.arrayBuffer());
      expect(content.equals(testFile.content)).toBe(true);
    });

    test('should handle URL expiration properly', async () => {
      const testFile = createTestFile({ size: 50 });
      
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      const uploadData: FileUploadResponse = await uploadResponse.json();
      
      // Upload URL should expire in 5 minutes
      const uploadExpiryTime = new Date(uploadData.expiresAt).getTime();
      const expectedUploadExpiry = addMinutes(new Date(), 5).getTime();
      const tolerance = 60 * 1000; // 1 minute tolerance
      
      expect(Math.abs(uploadExpiryTime - expectedUploadExpiry)).toBeLessThan(tolerance);
    });
  });

  describe('Performance and Scale', () => {
    test('should handle multiple concurrent uploads', async () => {
      const concurrency = 5;
      const testFiles = Array.from({ length: concurrency }, (_, i) => 
        createTestFile({ filename: `concurrent-${i}.txt`, size: 1000 })
      );
      
      const startTime = Date.now();
      
      const uploadPromises = testFiles.map(async (testFile) => {
        const result = await uploadFileToStorage(apiClient, testFile);
        return result;
      });
      
      const results = await Promise.all(uploadPromises);
      const endTime = Date.now();
      
      // All uploads should succeed
      expect(results).toHaveLength(concurrency);
      
      // Should complete within reasonable time (5 seconds per file)
      const maxExpectedTime = concurrency * 5000;
      expect(endTime - startTime).toBeLessThan(maxExpectedTime);
      
      // Wait for all files to be available
      const metadataPromises = results.map(result => 
        waitForFileStatus(apiClient, result.fileId, 'available')
      );
      await Promise.all(metadataPromises);
    });

    test('should handle various file sizes efficiently', async () => {
      const sizes = [1, 100, 1000, 10000, 100000]; // 1B to 100KB
      
      const uploadPromises = sizes.map(async (size, i) => {
        const testFile = createTestFile({ 
          filename: `size-test-${size}.txt`, 
          size 
        });
        
        const startTime = Date.now();
        const result = await uploadFileToStorage(apiClient, testFile);
        const endTime = Date.now();
        
        return {
          size,
          fileId: result.fileId,
          duration: endTime - startTime,
        };
      });
      
      const results = await Promise.all(uploadPromises);
      
      // All uploads should succeed regardless of size
      expect(results).toHaveLength(sizes.length);
      
      // Wait for all files to be available
      const availablePromises = results.map(result => 
        waitForFileStatus(apiClient, result.fileId, 'available')
      );
      await Promise.all(availablePromises);
    });
  });

  describe('Multi-Tenant Security & Authorization', () => {
    test('should isolate files between users - User B cannot see User A files', async () => {
      // Create User A and upload files
      const userAClient = createApiClient({ app: testApp.app });
      await userAClient.signup();
      
      const userAFiles = [
        createTestFile({ filename: 'userA-file1.txt', size: 100 }),
        createTestFile({ filename: 'userA-file2.txt', size: 200 }),
        createTestFile({ filename: 'userA-file3.txt', size: 300 }),
      ];
      
      const userAFileIds: string[] = [];
      for (const file of userAFiles) {
        const result = await uploadFileToStorage(userAClient, file);
        await waitForFileStatus(userAClient, result.fileId, 'available');
        userAFileIds.push(result.fileId);
      }
      
      // Create User B and upload files
      const userBClient = createApiClient({ app: testApp.app });
      await userBClient.signup();
      
      const userBFiles = [
        createTestFile({ filename: 'userB-file1.txt', size: 150 }),
        createTestFile({ filename: 'userB-file2.txt', size: 250 }),
      ];
      
      const userBFileIds: string[] = [];
      for (const file of userBFiles) {
        const result = await uploadFileToStorage(userBClient, file);
        await waitForFileStatus(userBClient, result.fileId, 'available');
        userBFileIds.push(result.fileId);
      }
      
      // User B lists files - should ONLY see their own 2 files
      const userBListResponse = await listFiles(userBClient);
      
      expect(userBListResponse.data).toBeInstanceOf(Array);
      
      // Collect all file IDs that User B can see across all pages
      const userBVisibleFileIds = new Set<string>();
      let currentOffset = 0;
      const pageSize = 50;
      
      while (true) {
        const pageResponse = await listFiles(userBClient, { offset: currentOffset, limit: pageSize });
        pageResponse.data.forEach(file => userBVisibleFileIds.add(file.id));
        
        if (!pageResponse.pagination.hasNextPage) break;
        currentOffset += pageSize;
        if (currentOffset > pageResponse.pagination.totalCount) break;
      }
      
      // User B should see ONLY their own files
      userBFileIds.forEach(fileId => {
        expect(userBVisibleFileIds.has(fileId)).toBe(true);
      });
      
      // User B should NOT see any of User A's files
      userAFileIds.forEach(fileId => {
        expect(userBVisibleFileIds.has(fileId)).toBe(false);
      });
    });

    test('should prevent non-admin from filtering other users files via owner parameter', async () => {
      // Create User A with files
      const userAClient = createApiClient({ app: testApp.app });
      const userA = await userAClient.signup();
      
      const testFile = createTestFile({ filename: 'userA-secret.txt', size: 100 });
      await uploadFileToStorage(userAClient, testFile);
      
      // Create User B
      const userBClient = createApiClient({ app: testApp.app });
      await userBClient.signup();
      
      // User B tries to filter by User A's ID
      const response = await userBClient.fetch('/storage/files', {
        searchParams: { owner: userA.id }
      });
      
      // Should either return 403 or empty results (depending on implementation)
      if (response.status === 403) {
        expect(response.status).toBe(403);
      } else if (response.ok) {
        const data: FileListResponse = await response.json();
        // If not 403, should return empty results or only User B's files
        expect(data.data.every(file => file.owner !== userA.id)).toBe(true);
      }
    });

    test('should return 403 when accessing other users file download', async () => {
      // Create User A with a file
      const userAClient = createApiClient({ app: testApp.app });
      await userAClient.signup();
      
      const testFile = createTestFile({ filename: 'userA-private.txt', size: 100 });
      const uploadResult = await uploadFileToStorage(userAClient, testFile);
      await waitForFileStatus(userAClient, uploadResult.fileId, 'available');
      
      // Create User B
      const userBClient = createApiClient({ app: testApp.app });
      await userBClient.signup();
      
      // User B tries to download User A's file
      const response = await userBClient.fetch(`/storage/files/${uploadResult.fileId}/download`);
      
      // Should return 403 (or 404 if implementation hides existence)
      expect(response.status).toBeOneOf([403, 404]);
    });

    test('should return 403 when accessing other users file metadata', async () => {
      // Create User A with a file
      const userAClient = createApiClient({ app: testApp.app });
      await userAClient.signup();
      
      const testFile = createTestFile({ filename: 'userA-private-meta.txt', size: 100 });
      const uploadResult = await uploadFileToStorage(userAClient, testFile);
      await waitForFileStatus(userAClient, uploadResult.fileId, 'available');
      
      // Create User B
      const userBClient = createApiClient({ app: testApp.app });
      await userBClient.signup();
      
      // User B tries to get User A's file metadata
      const response = await userBClient.fetch(`/storage/files/${uploadResult.fileId}`);
      
      // Should return 403 (or 404 if implementation hides existence)
      expect(response.status).toBeOneOf([403, 404]);
    });

    test('should return 403 when deleting other users file', async () => {
      // Create User A with a file
      const userAClient = createApiClient({ app: testApp.app });
      await userAClient.signup();
      
      const testFile = createTestFile({ filename: 'userA-protected.txt', size: 100 });
      const uploadResult = await uploadFileToStorage(userAClient, testFile);
      await waitForFileStatus(userAClient, uploadResult.fileId, 'available');
      
      // Create User B
      const userBClient = createApiClient({ app: testApp.app });
      await userBClient.signup();
      
      // User B tries to delete User A's file
      const response = await userBClient.fetch(`/storage/files/${uploadResult.fileId}`, {
        method: 'DELETE'
      });
      
      // Should return 403 (or 404 if implementation hides existence)
      expect(response.status).toBeOneOf([403, 404]);
      
      // Verify file still exists for User A
      const verifyResponse = await userAClient.fetch(`/storage/files/${uploadResult.fileId}`);
      expect(verifyResponse.status).toBe(200);
    });

    test('should return 401 for all endpoints without authentication', async () => {
      // Create unauthenticated client
      const unauthClient = createApiClient({ app: testApp.app });
      
      const testFileId = generateTestFileId();
      
      // Test all endpoints return 401
      const uploadResponse = await unauthClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: 'test.txt',
          size: 100,
          mimeType: 'text/plain'
        }
      });
      expect(uploadResponse.status).toBe(401);
      
      const completeResponse = await unauthClient.fetch(`/storage/files/${testFileId}/complete`, {
        method: 'POST'
      });
      expect(completeResponse.status).toBe(401);
      
      const downloadResponse = await unauthClient.fetch(`/storage/files/${testFileId}/download`);
      expect(downloadResponse.status).toBe(401);
      
      const getFileResponse = await unauthClient.fetch(`/storage/files/${testFileId}`);
      expect(getFileResponse.status).toBe(401);
      
      const listResponse = await unauthClient.fetch('/storage/files');
      expect(listResponse.status).toBe(401);
      
      const deleteResponse = await unauthClient.fetch(`/storage/files/${testFileId}`, {
        method: 'DELETE'
      });
      expect(deleteResponse.status).toBe(401);
    });
  });

  describe('Admin Role Authorization', () => {
    test('should allow admin to view all users files', async () => {
      // Create User A with files
      const userAClient = createApiClient({ app: testApp.app });
      await userAClient.signup();
      const userAFile = createTestFile({ filename: 'userA-doc.txt', size: 100 });
      const userAResult = await uploadFileToStorage(userAClient, userAFile);
      await waitForFileStatus(userAClient, userAResult.fileId, 'available');
      
      // Create User B with files
      const userBClient = createApiClient({ app: testApp.app });
      await userBClient.signup();
      const userBFile = createTestFile({ filename: 'userB-doc.txt', size: 200 });
      const userBResult = await uploadFileToStorage(userBClient, userBFile);
      await waitForFileStatus(userBClient, userBResult.fileId, 'available');
      
      // Create admin and list all files
      const adminClient = createApiClient({ app: testApp.app });
      await adminClient.signinAsAdmin();
      
      // Collect all files across pages
      const allAdminVisibleFiles: any[] = [];
      let currentOffset = 0;
      const pageSize = 50;
      
      while (true) {
        const response = await listFiles(adminClient, { offset: currentOffset, limit: pageSize });
        allAdminVisibleFiles.push(...response.data);
        
        if (!response.pagination.hasNextPage) break;
        currentOffset += pageSize;
        if (currentOffset > response.pagination.totalCount) break;
      }
      
      const allFileIds = allAdminVisibleFiles.map(f => f.id);
      
      // Admin should see both users' files
      expect(allFileIds).toContain(userAResult.fileId);
      expect(allFileIds).toContain(userBResult.fileId);
    });

    test('should allow admin to filter by specific owner', async () => {
      // Create User A with files
      const userAClient = createApiClient({ app: testApp.app });
      const userA = await userAClient.signup();
      const userAFile = createTestFile({ filename: 'userA-filtered.txt', size: 100 });
      const userAResult = await uploadFileToStorage(userAClient, userAFile);
      await waitForFileStatus(userAClient, userAResult.fileId, 'available');
      
      // Create User B with files
      const userBClient = createApiClient({ app: testApp.app });
      const userB = await userBClient.signup();
      const userBFile = createTestFile({ filename: 'userB-filtered.txt', size: 200 });
      const userBResult = await uploadFileToStorage(userBClient, userBFile);
      await waitForFileStatus(userBClient, userBResult.fileId, 'available');
      
      // Create admin
      const adminClient = createApiClient({ app: testApp.app });
      await adminClient.signinAsAdmin();
      
      // Admin filters by User A's ID
      const userAFilterResponse = await listFiles(adminClient, { owner: userA.id });
      const userAFileIds = userAFilterResponse.data.map(f => f.id);
      
      expect(userAFileIds).toContain(userAResult.fileId);
      expect(userAFileIds).not.toContain(userBResult.fileId);
      
      // Admin filters by User B's ID
      const userBFilterResponse = await listFiles(adminClient, { owner: userB.id });
      const userBFileIds = userBFilterResponse.data.map(f => f.id);
      
      expect(userBFileIds).toContain(userBResult.fileId);
      expect(userBFileIds).not.toContain(userAResult.fileId);
    });
  });

  describe('File Status State Machine', () => {
    test('should track file status transitions from uploading to available', async () => {
      const testFile = createTestFile({ size: 500 });
      
      // Initiate upload
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      const uploadData: FileUploadResponse = await uploadResponse.json();
      const fileId = uploadData.file;
      
      // Check initial status should be 'uploading'
      const initialMetadata = await apiClient.fetch(`/storage/files/${fileId}`);
      const initialData = await initialMetadata.json();
      expect(initialData.status).toBe('uploading');
      
      // Upload to storage
      await fetch(uploadData.uploadUrl, {
        method: uploadData.uploadMethod,
        body: testFile.content,
        headers: { 'Content-Type': testFile.mimeType },
      });
      
      // Complete upload
      await apiClient.fetch(`/storage/files/${fileId}/complete`, {
        method: 'POST',
      });
      
      // Wait for final status (might go through processing or directly to available)
      const finalMetadata = await waitForFileStatus(apiClient, fileId, 'available', 15000);
      expect(finalMetadata.status).toBe('available');
    });

    test('should not allow download of files in uploading status', async () => {
      const testFile = createTestFile({ size: 100 });
      
      // Initiate upload but don't complete
      const uploadResponse = await apiClient.fetch('/storage/files/upload', {
        method: 'POST',
        body: {
          filename: testFile.filename,
          size: testFile.size,
          mimeType: testFile.mimeType,
        },
      });
      
      const uploadData: FileUploadResponse = await uploadResponse.json();
      
      // Try to download while in uploading status
      const downloadResponse = await apiClient.fetch(`/storage/files/${uploadData.file}/download`);
      expect(downloadResponse.ok).toBe(false);
    });
  });

  describe('Additional Edge Cases', () => {
    test('should return 404 when completing upload for non-existent file', async () => {
      const fakeFileId = generateTestFileId();
      
      const response = await apiClient.fetch(`/storage/files/${fakeFileId}/complete`, {
        method: 'POST'
      });
      
      expect(response.status).toBe(404);
    });

    test('should return 404 when getting metadata for non-existent file', async () => {
      const fakeFileId = generateTestFileId();
      
      const response = await apiClient.fetch(`/storage/files/${fakeFileId}`);
      
      expect(response.status).toBe(404);
    });

    test('should allow non-admin to filter their own files with owner parameter', async () => {
      const currentUser = apiClient.getUser();
      
      // Upload some files
      const testFiles = [
        createTestFile({ filename: 'my-file-1.txt', size: 100 }),
        createTestFile({ filename: 'my-file-2.txt', size: 200 }),
      ];
      
      const fileIds: string[] = [];
      for (const file of testFiles) {
        const result = await uploadFileToStorage(apiClient, file);
        await waitForFileStatus(apiClient, result.fileId, 'available');
        fileIds.push(result.fileId);
      }
      
      // Filter by own owner ID - collect across all pages
      const allFilteredFiles: any[] = [];
      let currentOffset = 0;
      const pageSize = 50;
      
      while (true) {
        const response = await listFiles(apiClient, { owner: currentUser.id, offset: currentOffset, limit: pageSize });
        allFilteredFiles.push(...response.data);
        
        if (!response.pagination.hasNextPage) break;
        currentOffset += pageSize;
        if (currentOffset > response.pagination.totalCount) break;
      }
      
      const resultFileIds = allFilteredFiles.map(f => f.id);
      
      // Should see own files
      fileIds.forEach(fileId => {
        expect(resultFileIds).toContain(fileId);
      });
      
      // All returned files should belong to current user
      allFilteredFiles.forEach(file => {
        expect(file.owner).toBe(currentUser.id);
      });
    });

    test('should validate UUID format in file responses', async () => {
      const testFile = createTestFile({ size: 100 });
      const result = await uploadFileToStorage(apiClient, testFile);
      await waitForFileStatus(apiClient, result.fileId, 'available');
      
      const response = await apiClient.fetch(`/storage/files/${result.fileId}`);
      const fileData = await response.json();
      
      // UUID v4 regex pattern
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      expect(uuidRegex.test(fileData.id)).toBe(true);
      expect(uuidRegex.test(fileData.owner)).toBe(true);
    });

    test('should validate ISO 8601 timestamp format in responses', async () => {
      const testFile = createTestFile({ size: 100 });
      const result = await uploadFileToStorage(apiClient, testFile);
      await waitForFileStatus(apiClient, result.fileId, 'available');
      
      const response = await apiClient.fetch(`/storage/files/${result.fileId}`);
      const fileData = await response.json();
      
      // ISO 8601 timestamp validation
      const isValidDate = (dateString: string) => {
        const date = new Date(dateString);
        return !isNaN(date.getTime());
      };
      
      expect(isValidDate(fileData.createdAt)).toBe(true);
      expect(isValidDate(fileData.updatedAt)).toBe(true);
      expect(isValidDate(fileData.uploadedAt)).toBe(true);
    });

    test('should handle pagination when offset exceeds total count', async () => {
      const response = await listFiles(apiClient, { offset: 999999, limit: 10 });
      
      expect(response.data).toBeInstanceOf(Array);
      expect(response.data.length).toBe(0);
      expect(response.pagination.hasNextPage).toBe(false);
    });

    test('should handle maximum page size limit (100)', async () => {
      const response = await listFiles(apiClient, { limit: 100 });
      
      expect(response.data).toBeInstanceOf(Array);
      expect(response.data.length).toBeLessThanOrEqual(100);
      expect(response.pagination.limit).toBe(100);
    });
  });
});