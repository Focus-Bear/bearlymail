/**
 * Test helper utilities for creating type-safe partial mock objects.
 *
 * Usage:
 *   const mockEmail = mockPartial<Email>({ id: 'test-id', from: 'test@test.com' });
 */

/**
 * Creates a type-safe mock from a partial object.
 * Allows tests to only specify the fields they care about without
 * casting to `any`.
 *
 * @param partial - Partial shape of the target type
 * @returns The partial object cast to the full type (for test use only)
 */
export function mockPartial<T>(partial: Partial<T>): T {
  return partial as unknown as T;
}
