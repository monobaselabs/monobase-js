/**
 * File upload flow: 4 steps coordinated end-to-end.
 *
 *   1. Request a presigned upload URL from the API.
 *   2. PUT the file directly to the storage backend (S3-compatible).
 *   3. Mark the upload complete on the API.
 *   4. Fetch a presigned download URL.
 *
 * Each step is a separate API operation, but consumers shouldn't have to
 * orchestrate them. Exported as a plain async function plus a React hook
 * that adds progress tracking.
 */

import { useCallback, useState } from 'react';
import { uploadFile as requestUpload } from '../generated/sdk.gen';
import { completeFileUpload, getFileDownload } from '../generated/sdk.gen';
import { SdkError } from '../client';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export interface UploadFileResult {
  /** Stored file UUID. */
  fileId: string;
  /** Presigned download URL (short-lived). */
  downloadUrl: string;
  /** When the download URL expires. */
  expiresAt: Date;
}

export interface UploadFileOptions {
  /** Maximum allowed size in bytes. Default 50 MB. */
  maxBytes?: number;
  /** Optional progress callback (0–100). */
  onProgress?: (percent: number) => void;
  /** AbortController signal — cancels the in-flight S3 PUT and skips later steps. */
  signal?: AbortSignal;
}

class FileTooLargeError extends Error {
  constructor(public readonly limitBytes: number) {
    super(`File exceeds ${Math.round(limitBytes / (1024 * 1024))}MB limit`);
    this.name = 'FileTooLargeError';
  }
}

class S3UploadError extends Error {
  constructor(public readonly status: number, public readonly statusText: string) {
    super(`S3 upload failed: ${status} ${statusText}`);
    this.name = 'S3UploadError';
  }
}

/**
 * Run the full upload flow. Throws `FileTooLargeError`, `S3UploadError`, or
 * `SdkError` depending on which step fails.
 */
export async function uploadFile(
  file: File,
  options: UploadFileOptions = {},
): Promise<UploadFileResult> {
  const { maxBytes = DEFAULT_MAX_BYTES, onProgress, signal } = options;

  if (file.size > maxBytes) {
    throw new FileTooLargeError(maxBytes);
  }

  onProgress?.(10);

  // Step 1: request presigned URL.
  // The spec types `size` as int64 → BigInt; browser's File.size is number.
  const { data: uploadResp } = await requestUpload({
    body: {
      filename: file.name,
      size: BigInt(file.size),
      mimeType: file.type,
    },
    throwOnError: true,
    signal,
  });

  onProgress?.(30);

  // Step 2: PUT directly to S3
  const s3Response = await fetch(uploadResp.uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
    signal,
  });

  if (!s3Response.ok) {
    throw new S3UploadError(s3Response.status, s3Response.statusText);
  }

  onProgress?.(60);

  // Step 3: complete upload
  await completeFileUpload({
    path: { file: uploadResp.file },
    throwOnError: true,
    signal,
  });

  onProgress?.(80);

  // Step 4: fetch download URL
  const { data: downloadResp } = await getFileDownload({
    path: { file: uploadResp.file },
    throwOnError: true,
    signal,
  });

  onProgress?.(100);

  return {
    fileId: downloadResp.file.id,
    downloadUrl: downloadResp.downloadUrl,
    expiresAt: downloadResp.expiresAt,
  };
}

export interface UseFileUploadResult {
  upload: (file: File) => Promise<UploadFileResult>;
  isUploading: boolean;
  progress: number;
  error: Error | null;
  reset: () => void;
}

/**
 * React hook wrapping `uploadFile` with progress + lifecycle state.
 */
export function useFileUpload(options?: { maxBytes?: number }): UseFileUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setProgress(0);
      setError(null);
      try {
        return await uploadFile(file, {
          maxBytes: options?.maxBytes,
          onProgress: setProgress,
        });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsUploading(false);
      }
    },
    [options?.maxBytes],
  );

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  return { upload, isUploading, progress, error, reset };
}

export { FileTooLargeError, S3UploadError, SdkError };
