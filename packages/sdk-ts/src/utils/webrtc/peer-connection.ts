/**
 * WebRTC Peer Connection Wrapper
 * Manages RTCPeerConnection for 1-on-1 video calls
 */

import { SignalingClient, SignalMessage, ChatMessage } from './signaling-client'

type RemoteStreamHandler = (stream: MediaStream) => void
type ConnectionStateHandler = (state: RTCPeerConnectionState) => void
type ChatMessageHandler = (message: ChatMessage) => void

// Default fallback ICE servers (used if backend fetch fails)
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

export class VideoPeerConnection {
  private pc: RTCPeerConnection
  private signalingClient: SignalingClient
  private remoteStreamHandlers: RemoteStreamHandler[] = []
  private connectionStateHandlers: ConnectionStateHandler[] = []
  private chatMessageHandlers: ChatMessageHandler[] = []

  constructor(roomId: string, token: string, _isInitiator: boolean, iceServers?: RTCIceServer[], apiBaseUrl?: string) {
    // isInitiator parameter kept for future use

    // Use provided ICE servers or defaults
    const peerConfig: RTCConfiguration = {
      iceServers: iceServers || DEFAULT_ICE_SERVERS
    }

    this.pc = new RTCPeerConnection(peerConfig)
    this.signalingClient = new SignalingClient(roomId, token, apiBaseUrl)

    this.setupPeerConnectionHandlers()
    this.setupSignalingHandlers()
  }

  /**
   * Create VideoPeerConnection with ICE servers from backend
   * @param getIceServersFn - Function to fetch ICE servers from backend
   * @param apiBaseUrl - Base URL for the API (optional)
   */
  static async create(
    roomId: string,
    token: string,
    isInitiator: boolean,
    getIceServersFn?: () => Promise<{ iceServers: RTCIceServer[] }>,
    apiBaseUrl?: string
  ): Promise<VideoPeerConnection> {
    if (getIceServersFn) {
      try {
        // Fetch ICE servers from backend
        const { iceServers } = await getIceServersFn()
        console.log('[PeerConnection] Using ICE servers from backend:', iceServers.length)
        return new VideoPeerConnection(roomId, token, isInitiator, iceServers, apiBaseUrl)
      } catch (error) {
        console.warn('[PeerConnection] Failed to fetch ICE servers, using defaults:', error)
        return new VideoPeerConnection(roomId, token, isInitiator, DEFAULT_ICE_SERVERS, apiBaseUrl)
      }
    }
    return new VideoPeerConnection(roomId, token, isInitiator, DEFAULT_ICE_SERVERS, apiBaseUrl)
  }

  /**
   * Setup RTCPeerConnection event handlers
   */
  private setupPeerConnectionHandlers(): void {
    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[PeerConnection] Sending ICE candidate')
        this.signalingClient.send('ice-candidate', event.candidate.toJSON())
      }
    }

    // Handle remote stream
    this.pc.ontrack = (event) => {
      console.log('[PeerConnection] Received remote track')
      const remoteStream = event.streams[0]
      if (remoteStream) {
        this.remoteStreamHandlers.forEach(handler => handler(remoteStream))
      }
    }

    // Handle connection state changes
    this.pc.onconnectionstatechange = () => {
      console.log('[PeerConnection] State:', this.pc.connectionState)
      this.connectionStateHandlers.forEach(handler => handler(this.pc.connectionState))
    }

    // Log ICE connection state changes
    this.pc.oniceconnectionstatechange = () => {
      console.log('[PeerConnection] ICE State:', this.pc.iceConnectionState)
    }
  }

  /**
   * Setup signaling message handlers
   */
  private setupSignalingHandlers(): void {
    this.signalingClient.onMessage(async (message: SignalMessage) => {
      try {
        switch (message.type) {
          case 'offer':
            await this.handleOffer(message.data as RTCSessionDescriptionInit)
            break
          case 'answer':
            await this.handleAnswer(message.data as RTCSessionDescriptionInit)
            break
          case 'ice-candidate':
            await this.handleIceCandidate(message.data as RTCIceCandidateInit)
            break
        }
      } catch (error) {
        console.error('[PeerConnection] Error handling signaling message:', error)
      }
    })

    // Setup chat message handler
    this.signalingClient.onChatMessage((message: ChatMessage) => {
      this.chatMessageHandlers.forEach(handler => handler(message))
    })
  }

  /**
   * Handle incoming SDP offer
   */
  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[PeerConnection] Received offer')
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer))
    
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)
    
    console.log('[PeerConnection] Sending answer')
    this.signalingClient.send('answer', answer)
  }

  /**
   * Handle incoming SDP answer
   */
  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('[PeerConnection] Received answer')
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer))
  }

  /**
   * Handle incoming ICE candidate
   */
  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    console.log('[PeerConnection] Received ICE candidate')
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
  }

  /**
   * Connect to signaling server
   */
  connect(): void {
    this.signalingClient.connect()
  }

  /**
   * Start the call as initiator (provider)
   */
  async startCall(localStream: MediaStream): Promise<void> {
    console.log('[PeerConnection] Starting call as initiator')
    
    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      this.pc.addTrack(track, localStream)
    })

    // Create and send offer
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    
    console.log('[PeerConnection] Sending offer')
    this.signalingClient.send('offer', offer)
  }

  /**
   * Join the call as non-initiator (patient)
   */
  async joinCall(localStream: MediaStream): Promise<void> {
    console.log('[PeerConnection] Joining call')
    
    // Add local tracks to peer connection
    localStream.getTracks().forEach(track => {
      this.pc.addTrack(track, localStream)
    })
    
    // Wait for offer from initiator (handled in setupSignalingHandlers)
  }

  /**
   * Register handler for remote stream
   */
  onRemoteStream(handler: RemoteStreamHandler): void {
    this.remoteStreamHandlers.push(handler)
  }

  /**
   * Register handler for connection state changes
   */
  onConnectionStateChange(handler: ConnectionStateHandler): void {
    this.connectionStateHandlers.push(handler)
  }

  /**
   * Register handler for incoming chat messages
   */
  onChatMessage(handler: ChatMessageHandler): void {
    this.chatMessageHandlers.push(handler)
  }

  /**
   * Send chat message to peer
   */
  sendChatMessage(text: string): void {
    this.signalingClient.sendChatMessage(text)
  }

  /**
   * Replace video track with screen share track
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    const senders = this.pc.getSenders()
    const videoSender = senders.find(sender => sender.track?.kind === 'video')

    if (videoSender) {
      console.log('[PeerConnection] Replacing video track with screen share')
      await videoSender.replaceTrack(newTrack)
    } else {
      console.error('[PeerConnection] No video sender found')
    }
  }

  /**
   * Restore camera video track
   */
  async restoreVideoTrack(cameraTrack: MediaStreamTrack): Promise<void> {
    const senders = this.pc.getSenders()
    const videoSender = senders.find(sender => sender.track?.kind === 'video')

    if (videoSender) {
      console.log('[PeerConnection] Restoring camera video track')
      await videoSender.replaceTrack(cameraTrack)
    } else {
      console.error('[PeerConnection] No video sender found')
    }
  }

  /**
   * Close peer connection and cleanup
   */
  close(): void {
    console.log('[PeerConnection] Closing')

    this.pc.close()
    this.signalingClient.close()

    this.remoteStreamHandlers = []
    this.connectionStateHandlers = []
    this.chatMessageHandlers = []
  }

  /**
   * Get current connection state
   */
  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState
  }
}