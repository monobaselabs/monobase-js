/**
 * Mailpit API Helper
 * Provides functions to interact with Mailpit for email verification in tests
 *
 * Mailpit runs on:
 * - SMTP: localhost:1025
 * - Web UI: localhost:8025
 * - API: http://localhost:8025/api/v1
 */

const MAILPIT_API_BASE = 'http://localhost:8025/api/v1';

export interface MailpitMessage {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
  Created: string;
  Size: number;
  Snippet: string;
}

export interface MailpitMessageDetail extends MailpitMessage {
  HTML: string;
  Text: string;
  Headers: Record<string, string[]>;
}

export interface MailpitMessagesResponse {
  total: number;
  unread: number;
  count: number;
  messages: MailpitMessage[];
}

/**
 * Get all messages from Mailpit
 */
export async function getMailpitMessages(): Promise<MailpitMessage[]> {
  try {
    const response = await fetch(`${MAILPIT_API_BASE}/messages`);

    if (!response.ok) {
      throw new Error(`Mailpit API error: ${response.status} ${response.statusText}`);
    }

    const data: MailpitMessagesResponse = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('Failed to get Mailpit messages:', error);
    throw error;
  }
}

/**
 * Get a specific message by ID with full details
 */
export async function getMailpitMessage(messageId: string): Promise<MailpitMessageDetail> {
  try {
    const response = await fetch(`${MAILPIT_API_BASE}/message/${messageId}`);

    if (!response.ok) {
      throw new Error(`Mailpit API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to get Mailpit message ${messageId}:`, error);
    throw error;
  }
}

/**
 * Search for messages by recipient email address
 */
export async function getMailpitMessagesByRecipient(recipientEmail: string): Promise<MailpitMessage[]> {
  try {
    const response = await fetch(`${MAILPIT_API_BASE}/search?query=to:${encodeURIComponent(recipientEmail)}`);

    if (!response.ok) {
      throw new Error(`Mailpit API error: ${response.status} ${response.statusText}`);
    }

    const data: MailpitMessagesResponse = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error(`Failed to search Mailpit messages for ${recipientEmail}:`, error);
    throw error;
  }
}

/**
 * Wait for an email to arrive in Mailpit for a specific recipient
 * Polls Mailpit API until email is found or timeout is reached
 *
 * @param recipientEmail - Email address to search for
 * @param timeout - Maximum time to wait in milliseconds (default: 5000ms)
 * @param pollInterval - How often to check in milliseconds (default: 200ms)
 * @returns The full message details
 */
export async function waitForMailpitEmail(
  recipientEmail: string,
  timeout: number = 5000,
  pollInterval: number = 200
): Promise<MailpitMessageDetail> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const messages = await getMailpitMessagesByRecipient(recipientEmail);

    if (messages.length > 0) {
      // Get the most recent message
      const latestMessage = messages[0];
      return await getMailpitMessage(latestMessage.ID);
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout waiting for email to ${recipientEmail} after ${timeout}ms`);
}

/**
 * Clear all messages from Mailpit
 * Useful for cleaning up before/after tests
 */
export async function clearMailpit(): Promise<void> {
  try {
    const response = await fetch(`${MAILPIT_API_BASE}/messages`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Mailpit API error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to clear Mailpit messages:', error);
    throw error;
  }
}

/**
 * Wait for a specific number of emails to arrive for a recipient
 * Useful when testing batch email sends
 */
export async function waitForMailpitEmailCount(
  recipientEmail: string,
  expectedCount: number,
  timeout: number = 5000,
  pollInterval: number = 200
): Promise<MailpitMessage[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const messages = await getMailpitMessagesByRecipient(recipientEmail);

    if (messages.length >= expectedCount) {
      return messages;
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  const currentMessages = await getMailpitMessagesByRecipient(recipientEmail);
  throw new Error(
    `Timeout waiting for ${expectedCount} emails to ${recipientEmail}. ` +
    `Found ${currentMessages.length} after ${timeout}ms`
  );
}
