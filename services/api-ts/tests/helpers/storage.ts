/**
 * Storage E2E Test Helpers
 * Utilities for testing storage endpoints with real MinIO backend
 */

import { faker } from '@faker-js/faker';
import { createApiClient, type ApiClient } from './client';
import type { paths } from '@monobase/api-spec';

// Export types from the OpenAPI spec for easy access
export type FileMetadata = paths['/storage/files/{file}']['get']['responses']['200']['content']['application/json'];
export type FileUploadResponse = paths['/storage/files']['post']['responses']['201']['content']['application/json'];
export type FileDownloadResponse = paths['/storage/files/{file}/download']['get']['responses']['200']['content']['application/json'];
export type FileListResponse = paths['/storage/files']['get']['responses']['200']['content']['application/json'];

// Re-export for backward compatibility
export type FileMetadataResponse = FileMetadata;

/**
 * Test file data interface (internal helper)
 */
export interface TestFile {
  filename: string;
  content: Buffer;
  size: number;
  mimeType: string;
}

/**
 * Generate test file data with various types and sizes
 */
export function createTestFile(options: {
  type?: 'text' | 'image' | 'document' | 'binary';
  size?: number;
  filename?: string;
  mimeType?: string;
} = {}): TestFile {
  const { type = 'text', size, filename, mimeType } = options;

  let generatedFilename: string;
  let generatedMimeType: string;
  let content: Buffer;
  let actualSize: number;

  switch (type) {
    case 'text':
      generatedFilename = filename || `${faker.system.fileName({ extensionCount: 0 })}.txt`;
      generatedMimeType = mimeType || 'text/plain';
      const textContent = size ? 'A'.repeat(size) : faker.lorem.paragraphs(5);
      content = Buffer.from(textContent);
      actualSize = content.length;
      break;

    case 'image':
      generatedFilename = filename || `${faker.system.fileName({ extensionCount: 0 })}.jpg`;
      generatedMimeType = mimeType || 'image/jpeg';
      // Generate fake image data (simplified JPEG-like structure)
      const imageSize = size || 1024;
      content = Buffer.alloc(imageSize);
      // Add minimal JPEG header
      content.writeUInt16BE(0xFFD8, 0); // JPEG SOI marker
      content.writeUInt16BE(0xFFD9, imageSize - 2); // JPEG EOI marker
      actualSize = imageSize;
      break;

    case 'document':
      generatedFilename = filename || `${faker.system.fileName({ extensionCount: 0 })}.pdf`;
      generatedMimeType = mimeType || 'application/pdf';
      // Generate fake PDF data
      const docSize = size || 2048;
      content = Buffer.from(`%PDF-1.4\n${'A'.repeat(docSize - 20)}\n%%EOF`);
      actualSize = content.length;
      break;

    case 'binary':
      generatedFilename = filename || `${faker.system.fileName({ extensionCount: 0 })}.bin`;
      generatedMimeType = mimeType || 'application/octet-stream';
      const binarySize = size || 512;
      content = Buffer.alloc(binarySize);
      for (let i = 0; i < binarySize; i++) {
        content[i] = Math.floor(Math.random() * 256);
      }
      actualSize = binarySize;
      break;

    default:
      throw new Error(`Unknown file type: ${type}`);
  }

  return {
    filename: generatedFilename,
    content,
    size: actualSize,
    mimeType: generatedMimeType,
  };
}

/**
 * Create test file with specific size constraints
 */
export function createTestFileWithSize(sizeInMB: number, type: 'text' | 'binary' = 'text'): TestFile {
  const sizeInBytes = Math.floor(sizeInMB * 1024 * 1024);
  return createTestFile({ type, size: sizeInBytes });
}

/**
 * Upload a file through the complete workflow
 */
export async function uploadFileToStorage(
  apiClient: ApiClient,
  testFile: TestFile
): Promise<{
  fileId: string;
  uploadResponse: FileUploadResponse;
  completeResponse: any;
}> {
  // Step 1: Initiate upload
  const uploadResponse = await apiClient.fetch('/storage/files/upload', {
    method: 'POST',
    body: {
      filename: testFile.filename,
      size: testFile.size,
      mimeType: testFile.mimeType,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload initiation failed: ${uploadResponse.status} ${await uploadResponse.text()}`);
  }

  const uploadData: FileUploadResponse = await uploadResponse.json();

  // Step 2: Upload file to presigned URL (direct fetch for external URL)
  const storageUploadResponse = await fetch(uploadData.uploadUrl, {
    method: uploadData.uploadMethod,
    body: testFile.content,
    headers: {
      'Content-Type': testFile.mimeType,
    },
  });

  if (!storageUploadResponse.ok) {
    throw new Error(`Storage upload failed: ${storageUploadResponse.status}`);
  }

  // Step 3: Complete upload
  const completeResponse = await apiClient.fetch(`/storage/files/${uploadData.file}/complete`, {
    method: 'POST',
  });

  if (!completeResponse.ok) {
    throw new Error(`Upload completion failed: ${completeResponse.status} ${await completeResponse.text()}`);
  }

  const completeData = await completeResponse.json();

  return {
    fileId: uploadData.file,
    uploadResponse: uploadData,
    completeResponse: completeData,
  };
}

/**
 * Wait for file to reach expected status
 */
export async function waitForFileStatus(
  apiClient: ApiClient,
  fileId: string,
  expectedStatus: FileMetadataResponse['status'],
  timeoutMs: number = 10000
): Promise<FileMetadataResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await apiClient.fetch(`/storage/files/${fileId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get file metadata: ${response.status}`);
    }

    const metadata: FileMetadataResponse = await response.json();
    
    if (metadata.status === expectedStatus) {
      return metadata;
    }

    // Wait 100ms before next check
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`File ${fileId} did not reach status ${expectedStatus} within ${timeoutMs}ms`);
}

/**
 * Download file and return content
 */
export async function downloadFile(
  apiClient: ApiClient,
  fileId: string
): Promise<{
  content: Buffer;
  downloadResponse: FileDownloadResponse;
}> {
  // Get download URL
  const downloadUrlResponse = await apiClient.fetch(`/storage/files/${fileId}/download`);
  
  if (!downloadUrlResponse.ok) {
    throw new Error(`Failed to get download URL: ${downloadUrlResponse.status}`);
  }

  const downloadData: FileDownloadResponse = await downloadUrlResponse.json();

  // Download file from presigned URL (direct fetch for external URL)
  const fileResponse = await fetch(downloadData.downloadUrl);
  
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file: ${fileResponse.status}`);
  }

  const content = Buffer.from(await fileResponse.arrayBuffer());

  return {
    content,
    downloadResponse: downloadData,
  };
}



/**
 * List files with optional filters
 */
export async function listFiles(
  apiClient: ApiClient,
  options: {
    status?: 'uploading' | 'processing' | 'available' | 'failed';
    owner?: string;
    offset?: number;
    limit?: number;
  } = {}
): Promise<FileListResponse> {
  const response = await apiClient.fetch('/storage/files', {
    searchParams: options
  });
  
  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status}`);
  }

  return await response.json();
}

/**
 * List files with response pattern
 */
export async function listFilesWithResponse(
  apiClient: ApiClient,
  options: {
    status?: 'uploading' | 'processing' | 'available' | 'failed';
    owner?: string;
    offset?: number;
    limit?: number;
  } = {}
): Promise<{ response: Response; data?: FileListResponse }> {
  const response = await apiClient.fetch('/storage/files', {
    searchParams: options
  });
  
  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}

/**
 * Delete file
 */
export async function deleteFile(
  apiClient: ApiClient,
  fileId: string
): Promise<void> {
  const response = await apiClient.fetch(`/storage/files/${fileId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.status}`);
  }
}

/**
 * Delete file with response pattern
 */
export async function deleteFileWithResponse(
  apiClient: ApiClient,
  fileId: string
): Promise<{ response: Response }> {
  const response = await apiClient.fetch(`/storage/files/${fileId}`, {
    method: 'DELETE',
  });
  
  return { response };
}

/**
 * Upload a file using FormData (direct upload pattern)
 */
export async function uploadFile(
  apiClient: ApiClient,
  fileData: File | Buffer,
  fileName: string
): Promise<{ response: Response; data?: any }> {
  const formData = new FormData();
  formData.append('file', fileData, fileName);
  
  const response = await apiClient.fetch('/storage/upload', {
    method: 'POST',
    body: formData // Don't auto-convert FormData to JSON
  });
  
  if (response.ok) {
    const data = await response.json();
    return { response, data };
  }

  return { response };
}


/**
 * Generate random file ID for testing (UUID v4 format)
 */
export function generateTestFileId(): string {
  return faker.string.uuid();
}


/**
 * Create multiple test files for batch testing
 */
export function createTestFiles(count: number): TestFile[] {
  return Array.from({ length: count }, (_, i) => 
    createTestFile({ 
      type: ['text', 'image', 'document'][i % 3] as any,
      filename: `test-file-${i + 1}-${faker.string.alphanumeric(8)}.txt`
    })
  );
}

/**
 * Validate presigned URL format and expiration
 */
export function validatePresignedUrl(url: string, expiresAt: string): boolean {
  try {
    const urlObj = new URL(url);
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    
    // Check if URL has required query parameters for presigned URL
    const hasSignature = urlObj.searchParams.has('X-Amz-Signature') || 
                        urlObj.searchParams.has('Signature');
    const hasExpires = urlObj.searchParams.has('X-Amz-Expires') || 
                      urlObj.searchParams.has('Expires');
    
    // Check if expiry is in the future
    const validExpiry = expiryDate > now;
    
    return hasSignature && hasExpires && validExpiry;
  } catch {
    return false;
  }
}

/**
 * Test file MIME type validation
 */
export const SUPPORTED_MIME_TYPES = [
  'text/plain',
  'text/csv',
  'application/json',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/octet-stream',
];

/**
 * Get random supported MIME type
 */
export function getRandomMimeType(): string {
  return faker.helpers.arrayElement(SUPPORTED_MIME_TYPES);
}

/**
 * Create file with invalid characteristics for error testing
 */
export function createInvalidTestFile(type: 'too-large' | 'empty' | 'invalid-mime'): TestFile {
  switch (type) {
    case 'too-large':
      // Create file larger than 50MB limit
      return createTestFileWithSize(51);
    
    case 'empty':
      return createTestFile({ size: 0 });
    
    case 'invalid-mime':
      return createTestFile({ mimeType: 'invalid/type' });
    
    default:
      throw new Error(`Unknown invalid file type: ${type}`);
  }
}