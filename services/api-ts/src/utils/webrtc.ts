/**
 * WebRTC utilities for ICE server configuration
 */

/**
 * ICE server configuration for RTCPeerConnection
 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Default STUN servers (Google public servers)
 */
export const DEFAULT_ICE_SERVERS: IceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.services.mozilla.com' },
];

/**
 * Parse ICE server URL into RTCIceServer configuration
 * Format: protocol:[username:password@]host:port
 *
 * Examples:
 * - stun:stun.l.google.com:19302
 * - turn:monobase:monobase123@localhost:3478
 * - turns:user:pass@turn.example.com:5349
 *
 * @param url - ICE server URL to parse
 * @returns Parsed ICE server configuration
 * @throws Error if URL format is invalid
 */
export function parseIceServerUrl(url: string): IceServer {
  const trimmed = url.trim();

  // Match: protocol:[username:password@]host:port
  const match = trimmed.match(/^(stun|turn|turns):(?:([^:]+):([^@]+)@)?(.+)$/);

  if (!match) {
    throw new Error(`Invalid ICE server URL format: ${trimmed}`);
  }

  const [, protocol, username, password, hostPort] = match;

  // STUN servers don't need authentication
  if (protocol === 'stun') {
    return { urls: `stun:${hostPort}` };
  }

  // TURN/TURNS servers require authentication
  if (username && password) {
    return {
      urls: `${protocol}:${hostPort}`,
      username,
      credential: password
    };
  }

  // TURN without auth (unusual but valid)
  return { urls: `${protocol}:${hostPort}` };
}

/**
 * Parse comma-separated ICE server URLs
 *
 * @param urlString - Comma-separated list of ICE server URLs
 * @returns Array of parsed ICE server configurations
 */
export function parseIceServerUrls(urlString: string): IceServer[] {
  return urlString.split(',').map(parseIceServerUrl);
}
