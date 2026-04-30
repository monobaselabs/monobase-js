/**
 * Flows: multi-step workflows over generated SDK operations.
 *
 * Each flow composes 2+ generated calls (and sometimes a non-API side effect
 * like an S3 PUT or a Stripe redirect) into a single function. They live here
 * because they're not in the OpenAPI spec — they're product workflows on top
 * of the spec.
 */

export {
  uploadFile,
  useFileUpload,
  FileTooLargeError,
  S3UploadError,
  type UploadFileResult,
  type UploadFileOptions,
  type UseFileUploadResult,
} from './file-upload';

export {
  startBillingOnboarding,
  getMyMerchantAccount,
  isOnboardingComplete,
  canAccessDashboard,
  getAccountSetupStatus,
  type OnboardingStep,
  type OnboardingResult,
  type StartOnboardingArgs,
  type AccountSetupStatus,
} from './billing-onboarding';
