/**
 * Represents a raw contact from a contact provider (Gmail, Outlook, etc.)
 */
export interface RawContact {
  // Provider-specific ID (e.g., Google People resourceName)
  providerId: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  photoUrl?: string;
}

/**
 * Interface for contact provider implementations.
 * This abstraction allows supporting multiple contact providers (Gmail, Outlook, etc.)
 */
export interface ContactProvider {
  /**
   * Provider identifier (e.g., 'gmail', 'outlook')
   */
  readonly providerName: string;

  /**
   * Sync contacts from the provider
   * Should fetch contacts and create/update them in the database
   * @param userId User ID
   * @param fullSync If true, sync all contacts. If false, only sync changes since last sync.
   * @returns Number of contacts synced
   */
  syncContacts(userId: string, fullSync?: boolean): Promise<number>;

  /**
   * Search contacts directly from the provider (for real-time results)
   * @param userId User ID
   * @param query Search query
   * @param maxResults Maximum number of results
   */
  searchContacts(
    userId: string,
    query: string,
    maxResults?: number,
  ): Promise<RawContact[]>;

  /**
   * Check if the user is connected to this contact provider
   */
  isConnected(userId: string): Promise<boolean>;

  /**
   * Get a single contact by provider ID
   */
  getContact(userId: string, providerId: string): Promise<RawContact | null>;
}
