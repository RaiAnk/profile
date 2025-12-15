/**
 * AcousticTalk SDK - Mesh Coordinator
 * Self-organizing mesh network management
 */

import { MESSAGE_TYPES, DEVICE_STATES, STREAM_TYPES } from './constants.js';

export class MeshCoordinator {
  constructor(deviceId, options = {}) {
    this.deviceId = deviceId;
    this.meshId = options.meshId || this._generateMeshId();
    this.role = 'peer'; // 'coordinator', 'peer', 'relay'

    // Network topology
    this.peers = new Map();
    this.routes = new Map();
    this.hopCount = new Map();

    // Message tracking
    this.messageId = 0;
    this.seenMessages = new Set();
    this.pendingAcks = new Map();
    this.messageBuffer = new Map();

    // Streams
    this.activeStreams = new Map();
    this.streamSubscribers = new Map();

    // Callbacks
    this.onMessage = null;
    this.onPeerJoined = null;
    this.onPeerLeft = null;
    this.onStreamData = null;
    this.onBroadcast = null;

    // Configuration
    this.maxHops = options.maxHops || 5;
    this.ackTimeout = options.ackTimeout || 2000;
    this.maxRetries = options.maxRetries || 3;

    // Statistics
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      messagesRouted: 0,
      messagesDropped: 0,
      bytesTransferred: 0
    };

    // Cleanup old seen messages periodically
    setInterval(() => this._cleanupSeenMessages(), 30000);
  }

  /**
   * Generate unique mesh ID
   */
  _generateMeshId() {
    return `mesh_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Add a peer to the mesh
   */
  addPeer(peerId, info = {}) {
    const peer = {
      peerId: peerId,
      name: info.name || `Peer_${peerId.slice(0, 8)}`,
      capabilities: info.capabilities || [],
      state: DEVICE_STATES.CONNECTED,
      addedAt: Date.now(),
      lastSeen: Date.now(),
      hopCount: info.hopCount || 1,
      rssi: info.rssi || 0,
      latency: info.latency || 0
    };

    this.peers.set(peerId, peer);
    this.hopCount.set(peerId, peer.hopCount);

    // Direct route
    if (peer.hopCount === 1) {
      this.routes.set(peerId, peerId);
    }

    if (this.onPeerJoined) {
      this.onPeerJoined(peer);
    }

    return peer;
  }

  /**
   * Remove a peer from the mesh
   */
  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      this.peers.delete(peerId);
      this.routes.delete(peerId);
      this.hopCount.delete(peerId);

      // Update routes that went through this peer
      for (const [dest, route] of this.routes.entries()) {
        if (route === peerId) {
          this.routes.delete(dest);
        }
      }

      if (this.onPeerLeft) {
        this.onPeerLeft(peer);
      }
    }
  }

  /**
   * Update peer information
   */
  updatePeer(peerId, info) {
    const peer = this.peers.get(peerId);
    if (peer) {
      Object.assign(peer, info, { lastSeen: Date.now() });
    }
  }

  /**
   * Send a message to a specific peer
   */
  async sendMessage(targetId, data, options = {}) {
    const messageId = `${this.deviceId}_${++this.messageId}`;

    const message = {
      id: messageId,
      type: options.type || MESSAGE_TYPES.DATA,
      from: this.deviceId,
      to: targetId,
      data: data,
      timestamp: Date.now(),
      hopCount: 0,
      maxHops: this.maxHops,
      requireAck: options.requireAck !== false,
      streamId: options.streamId || null,
      priority: options.priority || 5
    };

    // Find route
    const nextHop = this._getNextHop(targetId);
    if (!nextHop) {
      return { success: false, error: 'No route to destination' };
    }

    // Track pending ack
    if (message.requireAck) {
      const ackPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pendingAcks.delete(messageId);
          reject(new Error('ACK timeout'));
        }, this.ackTimeout);

        this.pendingAcks.set(messageId, {
          resolve: () => {
            clearTimeout(timer);
            resolve({ success: true, messageId });
          },
          reject: reject,
          retries: 0
        });
      });

      this.stats.messagesSent++;
      return { messageId, nextHop, message, ackPromise };
    }

    this.stats.messagesSent++;
    return { success: true, messageId, nextHop, message };
  }

  /**
   * Broadcast message to all peers
   */
  broadcast(data, options = {}) {
    const messageId = `${this.deviceId}_${++this.messageId}`;

    const message = {
      id: messageId,
      type: MESSAGE_TYPES.DATA,
      from: this.deviceId,
      to: 'broadcast',
      data: data,
      timestamp: Date.now(),
      hopCount: 0,
      maxHops: options.maxHops || this.maxHops,
      ttl: options.ttl || 3
    };

    this.seenMessages.add(messageId);

    // Get all direct peers
    const targets = [];
    for (const [peerId, peer] of this.peers) {
      if (peer.hopCount === 1) {
        targets.push({ peerId, message: { ...message } });
      }
    }

    this.stats.messagesSent += targets.length;

    if (this.onBroadcast) {
      this.onBroadcast(message);
    }

    return { messageId, targets, message };
  }

  /**
   * Handle received message
   */
  handleMessage(message) {
    // Check if already seen
    if (this.seenMessages.has(message.id)) {
      return { handled: false, reason: 'duplicate' };
    }
    this.seenMessages.add(message.id);

    // Update sender info
    if (this.peers.has(message.from)) {
      this.updatePeer(message.from, { lastSeen: Date.now() });
    }

    // Handle ACK
    if (message.type === MESSAGE_TYPES.ACK) {
      return this._handleAck(message);
    }

    this.stats.messagesReceived++;

    // Is this message for us?
    if (message.to === this.deviceId || message.to === 'broadcast') {
      // Deliver locally
      if (this.onMessage) {
        this.onMessage(message);
      }

      // Handle stream data
      if (message.streamId && this.onStreamData) {
        this.onStreamData(message.streamId, message.data, message.from);
      }

      // Send ACK for unicast messages
      if (message.to === this.deviceId && message.requireAck) {
        return {
          handled: true,
          ack: this._createAck(message)
        };
      }

      // Forward broadcast messages
      if (message.to === 'broadcast' && message.hopCount < message.maxHops) {
        return {
          handled: true,
          forward: this._prepareForward(message)
        };
      }

      return { handled: true };
    }

    // Route message
    if (message.hopCount < message.maxHops) {
      this.stats.messagesRouted++;
      return {
        handled: true,
        forward: this._prepareForward(message)
      };
    }

    this.stats.messagesDropped++;
    return { handled: false, reason: 'max hops exceeded' };
  }

  /**
   * Create ACK message
   */
  _createAck(message) {
    return {
      id: `ack_${message.id}`,
      type: MESSAGE_TYPES.ACK,
      from: this.deviceId,
      to: message.from,
      data: { originalId: message.id },
      timestamp: Date.now(),
      hopCount: 0
    };
  }

  /**
   * Handle received ACK
   */
  _handleAck(message) {
    const originalId = message.data?.originalId;
    const pending = this.pendingAcks.get(originalId);

    if (pending) {
      pending.resolve();
      this.pendingAcks.delete(originalId);
      return { handled: true, ackFor: originalId };
    }

    return { handled: false, reason: 'unknown ack' };
  }

  /**
   * Prepare message for forwarding
   */
  _prepareForward(message) {
    const nextHop = message.to === 'broadcast'
      ? this._getBroadcastTargets(message.from)
      : this._getNextHop(message.to);

    return {
      message: {
        ...message,
        hopCount: message.hopCount + 1
      },
      nextHop: nextHop
    };
  }

  /**
   * Get next hop for destination
   */
  _getNextHop(targetId) {
    // Direct connection?
    if (this.peers.has(targetId) && this.peers.get(targetId).hopCount === 1) {
      return targetId;
    }

    // Use routing table
    return this.routes.get(targetId) || null;
  }

  /**
   * Get broadcast targets (excluding source)
   */
  _getBroadcastTargets(excludeId) {
    const targets = [];
    for (const [peerId, peer] of this.peers) {
      if (peerId !== excludeId && peer.hopCount === 1) {
        targets.push(peerId);
      }
    }
    return targets;
  }

  /**
   * Start a data stream
   */
  startStream(streamType, options = {}) {
    const streamId = `stream_${this.deviceId}_${Date.now()}`;

    const stream = {
      id: streamId,
      type: streamType,
      creator: this.deviceId,
      subscribers: new Set(),
      createdAt: Date.now(),
      bytesTransferred: 0,
      chunksTransferred: 0,
      state: 'active'
    };

    this.activeStreams.set(streamId, stream);

    // Announce stream
    const announcement = {
      streamId: streamId,
      streamType: streamType,
      creator: this.deviceId,
      ...options
    };

    return { streamId, announcement };
  }

  /**
   * Send stream data
   */
  sendStreamData(streamId, chunk, chunkIndex = 0) {
    const stream = this.activeStreams.get(streamId);
    if (!stream) {
      return { success: false, error: 'Stream not found' };
    }

    stream.bytesTransferred += chunk.length;
    stream.chunksTransferred++;
    this.stats.bytesTransferred += chunk.length;

    return {
      success: true,
      targets: Array.from(stream.subscribers),
      message: {
        type: MESSAGE_TYPES.STREAM_DATA,
        streamId: streamId,
        data: chunk,
        chunkIndex: chunkIndex,
        timestamp: Date.now()
      }
    };
  }

  /**
   * Subscribe to a stream
   */
  subscribeToStream(streamId, sourceId) {
    if (!this.streamSubscribers.has(streamId)) {
      this.streamSubscribers.set(streamId, new Set());
    }
    this.streamSubscribers.get(streamId).add(sourceId);

    return { success: true, streamId };
  }

  /**
   * End a stream
   */
  endStream(streamId) {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.state = 'ended';
      this.activeStreams.delete(streamId);

      return {
        success: true,
        stats: {
          bytesTransferred: stream.bytesTransferred,
          chunksTransferred: stream.chunksTransferred,
          duration: Date.now() - stream.createdAt
        }
      };
    }
    return { success: false };
  }

  /**
   * Update routing table from peer information
   */
  updateRoutes(routeInfo) {
    for (const [dest, info] of Object.entries(routeInfo)) {
      const currentHops = this.hopCount.get(dest) || Infinity;
      if (info.hopCount + 1 < currentHops) {
        this.routes.set(dest, info.via);
        this.hopCount.set(dest, info.hopCount + 1);
      }
    }
  }

  /**
   * Get routing table
   */
  getRoutes() {
    const routes = {};
    for (const [dest, nextHop] of this.routes) {
      routes[dest] = {
        nextHop: nextHop,
        hopCount: this.hopCount.get(dest) || 1
      };
    }
    return routes;
  }

  /**
   * Elect coordinator (simple highest-ID wins)
   */
  electCoordinator() {
    let highestId = this.deviceId;

    for (const peerId of this.peers.keys()) {
      if (peerId > highestId) {
        highestId = peerId;
      }
    }

    this.role = highestId === this.deviceId ? 'coordinator' : 'peer';
    return { coordinator: highestId, amCoordinator: this.role === 'coordinator' };
  }

  /**
   * Get mesh status
   */
  getStatus() {
    return {
      deviceId: this.deviceId,
      meshId: this.meshId,
      role: this.role,
      peerCount: this.peers.size,
      activeStreams: this.activeStreams.size,
      stats: this.stats
    };
  }

  /**
   * Get all peers
   */
  getPeers() {
    return Array.from(this.peers.values());
  }

  /**
   * Clean up old seen messages
   */
  _cleanupSeenMessages() {
    // Keep only last 1000 message IDs
    if (this.seenMessages.size > 1000) {
      const arr = Array.from(this.seenMessages);
      this.seenMessages = new Set(arr.slice(-500));
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      peers: this.peers.size,
      routes: this.routes.size,
      activeStreams: this.activeStreams.size,
      pendingAcks: this.pendingAcks.size
    };
  }

  /**
   * Clean up
   */
  dispose() {
    this.peers.clear();
    this.routes.clear();
    this.activeStreams.clear();
    this.pendingAcks.clear();
    this.seenMessages.clear();
  }
}

export default MeshCoordinator;
