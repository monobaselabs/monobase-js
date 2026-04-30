/**
 * Storage provider abstraction for S3 and MinIO
 * Handles file upload/download with presigned URLs
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Logger } from '@/types/logger';

/**
 * Storage configuration for S3/MinIO
 */
export interface StorageConfig {
  provider: 'minio' | 's3';
  endpoint?: string;
  publicEndpoint?: string; // External-facing endpoint for presigned URLs
  bucket: string;
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  uploadUrlExpiry: number;
  downloadUrlExpiry: number;
}

export interface StorageProvider {
  generateUploadUrl(fileId: string, mimeType: string): Promise<string>;
  generateDownloadUrl(fileId: string): Promise<string>;
  deleteFile(fileId: string): Promise<void>;
  verifyFileExists(fileId: string): Promise<boolean>;
  initializeBucket(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private publicClient: S3Client; // Client for generating public URLs
  private config: StorageConfig;
  private logger?: Logger;
  private bucketInitialized = false;

  constructor(config: StorageConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger;

    // Configure S3 client based on provider
    const clientConfig: S3ClientConfig = {
      region: config.region || 'us-east-1', // Default region for MinIO
      credentials: config.credentials,
    };

    // Add endpoint for MinIO or custom S3-compatible storage
    if (config.provider === 'minio' && config.endpoint) {
      clientConfig.endpoint = config.endpoint;
      clientConfig.forcePathStyle = true; // Required for MinIO
    }

    this.client = new S3Client(clientConfig);

    // Create separate client for public URLs if publicEndpoint is configured
    if (config.publicEndpoint) {
      const publicClientConfig: S3ClientConfig = {
        region: config.region || 'us-east-1',
        credentials: config.credentials,
        endpoint: config.publicEndpoint,
        forcePathStyle: config.provider === 'minio',
      };
      this.publicClient = new S3Client(publicClientConfig);
    } else {
      this.publicClient = this.client; // Use same client if no public endpoint
    }
  }

  /**
   * Ensure bucket exists (lazy initialization)
   * Called before operations that require the bucket
   */
  private async ensureBucketExists(): Promise<void> {
    if (this.bucketInitialized) {
      return;
    }

    await this.initializeBucket();
    this.bucketInitialized = true;
  }

  /**
   * Generate presigned URL for file upload
   */
  async generateUploadUrl(fileId: string, mimeType: string): Promise<string> {
    await this.ensureBucketExists();
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
      ContentType: mimeType,
    });

    // Use publicClient for generating URLs accessible from outside Docker network
    const url = await getSignedUrl(this.publicClient, command, {
      expiresIn: this.config.uploadUrlExpiry,
    });

    this.logger?.debug({ fileId, mimeType }, 'Generated upload URL');
    return url;
  }

  /**
   * Generate presigned URL for file download
   */
  async generateDownloadUrl(fileId: string): Promise<string> {
    await this.ensureBucketExists();
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
    });

    // Use publicClient for generating URLs accessible from outside Docker network
    const url = await getSignedUrl(this.publicClient, command, {
      expiresIn: this.config.downloadUrlExpiry,
    });

    this.logger?.debug({ fileId }, 'Generated download URL');
    return url;
  }

  /**
   * Delete file from storage
   */
  async deleteFile(fileId: string): Promise<void> {
    await this.ensureBucketExists();
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
    });

    try {
      await this.client.send(command);
      this.logger?.info({ fileId }, 'File deleted from storage');
    } catch (error) {
      this.logger?.error({ error, fileId }, 'Failed to delete file from storage');
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  /**
   * Verify if file exists in storage
   */
  async verifyFileExists(fileId: string): Promise<boolean> {
    await this.ensureBucketExists();
    const command = new HeadObjectCommand({
      Bucket: this.config.bucket,
      Key: fileId,
    });

    try {
      await this.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this.logger?.error({ error, fileId }, 'Error checking file existence');
      throw new Error(`Failed to verify file existence: ${error}`);
    }
  }

  /**
   * Initialize bucket (create if doesn't exist)
   * Useful for MinIO development environments
   */
  async initializeBucket(): Promise<void> {
    try {
      // Check if bucket exists
      const headCommand = new HeadBucketCommand({
        Bucket: this.config.bucket,
      });
      
      await this.client.send(headCommand);
      this.logger?.debug({ bucket: this.config.bucket }, 'Bucket already exists');
    } catch (error: any) {
      // MinIO returns 400 for non-existent buckets in some cases, treat it as NotFound
      const isNotFound = error.name === 'NotFound' || 
                        error.$metadata?.httpStatusCode === 404 ||
                        (error.$metadata?.httpStatusCode === 400 && this.config.provider === 'minio');
      
      if (isNotFound) {
        // Create bucket if it doesn't exist
        try {
          const createCommand = new CreateBucketCommand({
            Bucket: this.config.bucket,
          });
          
          await this.client.send(createCommand);
          this.logger?.info({ bucket: this.config.bucket }, 'Bucket created successfully');
        } catch (createError: any) {
          // Ignore error if bucket already exists (race condition)
          if (createError.name === 'BucketAlreadyOwnedByYou' || createError.name === 'BucketAlreadyExists') {
            this.logger?.debug({ bucket: this.config.bucket }, 'Bucket already exists (race condition)');
          } else {
            this.logger?.error({ error: createError, bucket: this.config.bucket }, 'Failed to create bucket');
            throw new Error(`Failed to create bucket: ${createError}`);
          }
        }
      } else {
        this.logger?.error({ error, bucket: this.config.bucket }, 'Error checking bucket existence');
        throw new Error(`Failed to check bucket existence: ${error}`);
      }
    }
  }

  /**
   * Health check for storage connectivity
   * Ensures bucket exists and is accessible (self-healing for development)
   * Note: Creates bucket if it doesn't exist - essential for dev environments
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Ensure bucket exists (creates if needed)
      await this.ensureBucketExists();
      
      const headCommand = new HeadBucketCommand({
        Bucket: this.config.bucket,
      });
      
      await this.client.send(headCommand);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create storage provider instance based on configuration
 */
export function createStorageProvider(config: StorageConfig, logger?: Logger): StorageProvider {
  return new S3StorageProvider(config, logger);
}