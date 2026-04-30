/**
 * Generic optimistic-mutation helper for the auto-generated SDK.
 *
 * Wraps a generated `xxxMutation()` config with TanStack Query's
 * onMutate/onError/onSettled lifecycle so callers don't have to hand-write
 * the snapshot/rollback/invalidate dance per mutation.
 *
 * Usage:
 *   useOptimisticMutation(markNotificationAsReadMutation(), {
 *     optimistic: {
 *       queryKey: () => listNotificationsQueryKey(),
 *       updater: (current, vars) => markRead(current, vars.path.notification),
 *     },
 *     invalidates: [listNotificationsQueryKey()],
 *   })
 *
 * The 80% case (single resource, single cache entry) fits in this helper.
 * Mutations that touch multiple caches with cross-resource rollback should
 * keep using TanStack Query's primitives directly — see CONTRIBUTING.md.
 */

import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from '@tanstack/react-query';

interface OptimisticSpec<TVars, TSnapshot> {
  /** TanStack query key to snapshot, optimistically update, and refetch. */
  queryKey: (vars: TVars) => QueryKey;
  /** Apply the optimistic mutation to the current cache value. */
  updater: (current: TSnapshot | undefined, vars: TVars) => TSnapshot | undefined;
}

interface UseOptimisticMutationConfig<TData, TError, TVars, TSnapshot> {
  /**
   * Optimistic update spec. Skipping this turns the helper into a thin
   * wrapper that just runs `invalidates` on settle.
   */
  optimistic?: OptimisticSpec<TVars, TSnapshot>;
  /** Extra query keys to invalidate after the mutation settles. */
  invalidates?: QueryKey[];
  /** Forwarded after the helper's own onMutate runs. */
  onMutate?: (vars: TVars) => Promise<unknown> | unknown;
  /** Forwarded after rollback on error. */
  onError?: (error: TError, vars: TVars) => void;
  /** Forwarded after success. */
  onSuccess?: (data: TData, vars: TVars) => void;
}

interface MutationContext<TSnapshot> {
  snapshot: TSnapshot | undefined;
  optimisticKey: QueryKey | undefined;
}

/**
 * Combine a generated mutation's `UseMutationOptions` with optimistic-update
 * scaffolding. `TSnapshot` is the cache value type at `optimistic.queryKey`;
 * supply it explicitly when calling so `updater` is correctly typed.
 */
export function useOptimisticMutation<
  TData,
  TError,
  TVars,
  TSnapshot = unknown,
>(
  mutationOptions: UseMutationOptions<TData, TError, TVars>,
  config: UseOptimisticMutationConfig<TData, TError, TVars, TSnapshot> = {},
) {
  const queryClient = useQueryClient();
  const { optimistic, invalidates = [], onMutate, onError, onSuccess } = config;

  return useMutation<TData, TError, TVars, MutationContext<TSnapshot>>({
    ...mutationOptions,
    onMutate: async (vars) => {
      let snapshot: TSnapshot | undefined;
      let optimisticKey: QueryKey | undefined;
      if (optimistic) {
        optimisticKey = optimistic.queryKey(vars);
        await queryClient.cancelQueries({ queryKey: optimisticKey });
        snapshot = queryClient.getQueryData<TSnapshot>(optimisticKey);
        const next = optimistic.updater(snapshot, vars);
        if (next !== undefined) {
          queryClient.setQueryData<TSnapshot>(optimisticKey, next);
        }
      }
      await onMutate?.(vars);
      return { snapshot, optimisticKey };
    },
    onError: (error, vars, context) => {
      if (context?.optimisticKey !== undefined) {
        queryClient.setQueryData<TSnapshot>(context.optimisticKey, context.snapshot);
      }
      onError?.(error, vars);
    },
    onSuccess: (data, vars) => {
      onSuccess?.(data, vars);
    },
    onSettled: (_data, _error, vars, context) => {
      if (context?.optimisticKey !== undefined) {
        queryClient.invalidateQueries({ queryKey: context.optimisticKey });
      }
      for (const qk of invalidates) {
        queryClient.invalidateQueries({ queryKey: qk });
      }
    },
  });
}
