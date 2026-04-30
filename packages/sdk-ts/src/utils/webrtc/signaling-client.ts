/**
 * WebSocket Signaling Client for WebRTC
 * Handles signaling message exchange between peers via backend WebSocket server
 */

export type SignalType = 'offer' | 'answer' | 'ice-candidate'

export interface SignalMessage {
  type: SignalType
  from: string
  data: RTCSessionDescriptionInit | RTCIceCandidateInit
}

export interface ChatMessage {
  from: string
  text: string
  timestamp: string
}

type MessageHandler = (message: SignalMessage) => void
type ChatMessageHandler = (message: ChatMessage) => void
type StateChangeHandler = (state: 'connecting' | 'open' | 'closed' | 'error') => void

/**
 * Convert HTTP(S) API base URL to WebSocket URL
 */
function getWebSocketUrl(httpUrl: string): string {
  return httpUrl.replace(/^https?:\/\//, (match) =>
    match === 'https://' ? 'wss://' : 'ws://'
  )
}

export class SignalingClient {
  private ws: WebSocket | null = null
  private messageHandlers: MessageHandler[] = []
  private chatMessageHandlers: ChatMessageHandler[] = []
  private stateChangeHandlers: StateChangeHandler[] = []
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private wsBaseUrl: string

  constructor(
    private roomId: string,
    _token: string, // Token param kept for future authentication
    apiBaseUrl?: string
  ) {
    // Convert HTTP API URL to WebSocket URL
    // Default to localhost if not provided
    this.wsBaseUrl = getWebSocketUrl(apiBaseUrl || 'http://localhost:7213')
  }

  /**
   * Connect to WebSocket signaling server
   */
  connect(): void {
    const url = `${this.wsBaseUrl}/ws/comms/chat-rooms/${this.roomId}`

    try {
      // Note: Browser WebSocket constructor doesn't support headers parameter
      // Authorization should be passed via query params or handled by consuming app
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('[Signaling] WebSocket connected')
        this.reconnectAttempts = 0
        this.notifyStateChange('open')
      }

      this.ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data)

          // Handle connection confirmation
          if (envelope.event === 'connected') {
            console.log('[Signaling] Connection confirmed:', envelope.payload)
            return
          }

          // Filter system events
          if (envelope.event === 'user.joined' || envelope.event === 'user.left') {
            console.log('[Signaling] System event:', envelope.event)
            return
          }

          // Parse video signaling messages
          if (envelope.event?.startsWith('video.')) {
            const message = envelope.payload as SignalMessage
            console.log('[Signaling] Received:', message.type)
            this.messageHandlers.forEach(handler => handler(message))
          }

          // Parse chat messages
          if (envelope.event === 'chat.message') {
            const chatMessage = envelope.payload as ChatMessage
            console.log('[Signaling] Received chat message from:', chatMessage.from)
            this.chatMessageHandlers.forEach(handler => handler(chatMessage))
          }
        } catch (error) {
          console.error('[Signaling] Failed to parse message:', error)
        }
      }

      this.ws.onerror = (error) => {
        console.error('[Signaling] WebSocket error:', error)
        this.notifyStateChange('error')
      }

      this.ws.onclose = () => {
        console.log('[Signaling] WebSocket closed')
        this.notifyStateChange('closed')
        this.attemptReconnect()
      }
    } catch (error) {
      console.error('[Signaling] Failed to create WebSocket:', error)
      this.notifyStateChange('error')
    }
  }

  /**
   * Send signaling message to peer
   */
  send(type: SignalType, data: RTCSessionDescriptionInit | RTCIceCandidateInit): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Signaling] Cannot send - WebSocket not open')
      return
    }

    const message = { type: `video.${type}`, data }

    console.log('[Signaling] Sending:', type)
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Send chat message
   */
  sendChatMessage(text: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('[Signaling] Cannot send chat - WebSocket not open')
      return
    }

    const message = { type: 'chat.message', data: { text } }

    console.log('[Signaling] Sending chat message')
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Register handler for incoming signaling messages
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler)
  }

  /**
   * Register handler for incoming chat messages
   */
  onChatMessage(handler: ChatMessageHandler): void {
    this.chatMessageHandlers.push(handler)
  }

  /**
   * Register handler for connection state changes
   */
  onStateChange(handler: StateChangeHandler): void {
    this.stateChangeHandlers.push(handler)
  }

  /**
   * Close WebSocket connection
   */
  close(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.messageHandlers = []
    this.chatMessageHandlers = []
    this.stateChangeHandlers = []
  }

  /**
   * Attempt to reconnect after disconnect
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[Signaling] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000)
    
    console.log(`[Signaling] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * Notify all state change handlers
   */
  private notifyStateChange(state: 'connecting' | 'open' | 'closed' | 'error'): void {
    this.stateChangeHandlers.forEach(handler => handler(state))
  }
}