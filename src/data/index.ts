/**
 * Chooses which backend the app runs against.
 *
 * This is the entire swap: point `VITE_DATA_SOURCE` at `supabase`, supply the
 * project URL and anon key, and every screen keeps working unchanged because
 * they all sit behind `HauntDataSource`.
 */

import { config } from '../config'
import type { HauntDataSource } from './dataSource'
import { createMockDataSource } from './mockDataSource'

export type {
  AppSnapshot,
  DataErrorCode,
  DropResult,
  FriendRequestResult,
  HauntDataSource,
  LocationRequestResult,
  PassResult,
  VisitResult,
} from './dataSource'
export { DataError, toDataError } from './dataSource'
export { createMockDataSource, resetMockDataSource } from './mockDataSource'

/**
 * Builds the configured backend.
 *
 * Async because the Supabase adapter is imported on demand: it pulls in the
 * client library, which is a couple of hundred kilobytes the default mock
 * backend has no use for. Nothing else waits on this — the app is already
 * loading asynchronously at the point it is called.
 */
export async function createDataSource(): Promise<HauntDataSource> {
  if (config.dataSource === 'supabase') {
    const { createSupabaseDataSource } = await import('./supabase/supabaseDataSource')
    return createSupabaseDataSource()
  }
  return createMockDataSource()
}
