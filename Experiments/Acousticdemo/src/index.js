/**
 * AcousticTalk SDK
 * Infrastructure-free, zero-config acoustic mesh networking
 *
 * @author AcousticTalk
 * @version 1.0.0
 */

import { ACOUSTIC_CONFIG, MESSAGE_TYPES, DEVICE_STATES, STREAM_TYPES, SECURITY_CONFIG } from './core/constants.js';
import { AudioIO } from './core/audio-io.js';
import { DeviceDiscovery } from './core/discovery.js';
import { MeshCoordinator } from './core/mesh.js';
import { PhysicalLayer } from './layers/physical.js';
import { MACLayer } from './layers/mac.js';
import { EncodingLayer } from './layers/encoding.js';
import { SecurityLayer } from './security/security.js';
import { SignalProcessor } from './ai/signal-processor.js';

/**
 * Main AcousticMesh class - Developer-facing API
 */
export class AcousticMesh {
  constructor(options = {}) {
    // Generate or use provided device ID
    this.deviceId = options.deviceId || this._generateDeviceId();
    this.deviceName = options.deviceName || `Device_${this.deviceId.slice(0, 8)}`;

    // Mode selection
    this.mode = options.mode || 'ultrasonic'; // 'ultrasonic' or 'audible'

    // Initialize layers
    this.audioIO = new AudioIO({ sampleRate: ACOUSTIC_CONFIG.SAMPLE_RATE });
    this.physical = new PhysicalLayer({ mode: this.mode });
    this.mac = new MACLayer(this.deviceId, { priority: options.priority || 5 });
    this.encoding = new EncodingLayer();
    this.discovery = new DeviceDiscovery({
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: options.deviceType || 'generic',
      capabilities: options.capabilities || ['text', 'image', 'data']
    });
    this.mesh = new MeshCoordinator(this.deviceId);
    this.security = new SecurityLayer(this.deviceId);
    this.signalProcessor = new SignalProcessor();

    // State
    this.state = DEVICE_STATES.INITIALIZING;
    this.isRunning = false;

    // Callbacks
    this.onStateChange = options.onStateChange || null;
    this.onDeviceDiscovered = options.onDeviceDiscovered || null;
    this.onDeviceLost = options.onDeviceLost || null;
    this.onMessage = options.onMessage || null;
    this.onStream = options.onStream || null;
    this.onError = options.onError || null;

    // Message buffer for reception
    this.receiveBuffer = [];
    this.receivingFrame = false;

    // Performance tracking
    this.performanceStats = {
      startTime: null,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      messageCount: 0,
      latencySum: 0
    };

    // Wire up internal callbacks
    this._setupInternalCallbacks();
  }

  /**
   * Generate unique device ID
   */
  _generateDeviceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Set up internal callback wiring
   */
  _setupInternalCallbacks() {
    // Discovery callbacks
    this.discovery.onDeviceDiscovered = (device) => {
      this.mesh.addPeer(device.deviceId, {
        name: device.deviceName,
        capabilities: device.capabilities
      });
      if (this.onDeviceDiscovered) {
        this.onDeviceDiscovered(device);
      }
    };

    this.discovery.onDeviceLost = (device) => {
      this.mesh.removePeer(device.deviceId);
      if (this.onDeviceLost) {
        this.onDeviceLost(device);
      }
    };

    // Mesh message callback
    this.mesh.onMessage = (message) => {
      if (this.onMessage) {
        this.onMessage(message);
      }
    };

    // MAC transmit opportunity
    this.mac.onTransmitOpportunity = (frameData) => {
      this._transmitFrame(frameData);
    };
  }

  /**
   * Initialize the mesh (request permissions, set up audio)
   */
  async initialize() {
    try {
      this._setState(DEVICE_STATES.INITIALIZING);

      // Initialize audio
      const audioResult = await this.audioIO.initialize();
      if (!audioResult.success) {
        throw new Error(`Audio init failed: ${audioResult.error}`);
      }

      // Initialize security
      await this.security.initialize();

      // Request slot
      await this.mac.requestSlots(1);

      this._setState(DEVICE_STATES.IDLE);

      return {
        success: true,
        deviceId: this.deviceId,
        sampleRate: audioResult.sampleRate,
        dataRate: this.physical.getDataRate()
      };
    } catch (error) {
      this._setState(DEVICE_STATES.ERROR);
      if (this.onError) {
        this.onError(error);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Start the mesh (discovery, listening, transmitting)
   */
  async start() {
    if (this.state === DEVICE_STATES.ERROR) {
      throw new Error('Cannot start in error state. Call initialize() first.');
    }

    this.isRunning = true;
    this.performanceStats.startTime = Date.now();

    // Start discovery
    this.discovery.startDiscovery();

    // Start listening
    this.audioIO.startListening((samples) => {
      this._handleIncomingAudio(samples);
    });

    this._setState(DEVICE_STATES.SCANNING);

    // Send initial beacon
    await this._sendBeacon();

    // Periodic beacon
    this.beaconInterval = setInterval(() => {
      if (this.isRunning) {
        this._sendBeacon();
      }
    }, ACOUSTIC_CONFIG.BEACON_INTERVAL);

    return { success: true, state: this.state };
  }

  /**
   * Stop the mesh
   */
  stop() {
    this.isRunning = false;

    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
    }

    this.audioIO.stopListening();
    this.discovery.stopDiscovery();

    this._setState(DEVICE_STATES.IDLE);

    return { success: true };
  }

  /**
   * Discover nearby devices
   */
  async discover(timeout = 5000) {
    return new Promise((resolve) => {
      const devices = [];

      const originalCallback = this.onDeviceDiscovered;
      this.onDeviceDiscovered = (device) => {
        devices.push(device);
        if (originalCallback) originalCallback(device);
      };

      setTimeout(() => {
        this.onDeviceDiscovered = originalCallback;
        resolve(devices);
      }, timeout);
    });
  }

  /**
   * Send text message to a device
   */
  async sendText(targetId, text, options = {}) {
    const encoded = this.encoding.encodeStream(text, STREAM_TYPES.TEXT);
    return this._sendData(targetId, encoded, {
      ...options,
      streamType: STREAM_TYPES.TEXT
    });
  }

  /**
   * Send image to a device
   */
  async sendImage(targetId, imageData, options = {}) {
    const encoded = this.encoding.encodeStream(imageData, STREAM_TYPES.IMAGE);
    return this._sendData(targetId, encoded, {
      ...options,
      streamType: STREAM_TYPES.IMAGE
    });
  }

  /**
   * Send binary data to a device
   */
  async sendData(targetId, data, options = {}) {
    const encoded = data instanceof Uint8Array ? data : new Uint8Array(data);
    return this._sendData(targetId, encoded, {
      ...options,
      streamType: STREAM_TYPES.BINARY
    });
  }

  /**
   * Broadcast message to all devices
   */
  async broadcast(data, options = {}) {
    const encoded = typeof data === 'string'
      ? this.encoding.encodeStream(data, STREAM_TYPES.TEXT)
      : new Uint8Array(data);

    return this._broadcastData(encoded, options);
  }

  /**
   * Start a data stream
   */
  startStream(streamType, options = {}) {
    const { streamId, announcement } = this.mesh.startStream(streamType, options);

    // Broadcast stream announcement
    this._broadcastData(
      new TextEncoder().encode(JSON.stringify(announcement)),
      { type: MESSAGE_TYPES.STREAM_START }
    );

    return {
      streamId,
      sendChunk: (chunk) => this._sendStreamChunk(streamId, chunk),
      end: () => this._endStream(streamId)
    };
  }

  /**
   * Subscribe to a stream
   */
  subscribeToStream(streamId, sourceId, callback) {
    this.mesh.subscribeToStream(streamId, sourceId);
    this.mesh.onStreamData = (sid, data, from) => {
      if (sid === streamId) {
        callback(data, from);
      }
    };
  }

  /**
   * Internal: Send data to specific device
   */
  async _sendData(targetId, data, options = {}) {
    // Fragment if necessary
    const frames = this.encoding.fragmentData(data, {
      type: options.type || MESSAGE_TYPES.DATA
    });

    // Apply FEC
    const encodedFrames = frames.map(frame => this.encoding.applyFEC(frame));

    // Queue for transmission
    const results = [];
    for (const frame of encodedFrames) {
      const result = await this.mesh.sendMessage(targetId, frame, options);
      if (result.message) {
        this.mac.queueFrame(result.message, options.priority || 5);
      }
      results.push(result);
    }

    this.performanceStats.totalBytesSent += data.length;
    this.performanceStats.messageCount++;

    return {
      success: true,
      frameCount: frames.length,
      bytesSent: data.length
    };
  }

  /**
   * Internal: Broadcast data
   */
  async _broadcastData(data, options = {}) {
    const frames = this.encoding.fragmentData(data, {
      type: options.type || MESSAGE_TYPES.DATA
    });

    for (const frame of frames) {
      const result = this.mesh.broadcast(frame, options);
      for (const target of result.targets) {
        this.mac.queueFrame({ ...result.message, nextHop: target.peerId });
      }
    }

    this.performanceStats.totalBytesSent += data.length;

    return {
      success: true,
      frameCount: frames.length,
      targetCount: this.mesh.getPeers().length
    };
  }

  /**
   * Internal: Transmit frame via audio
   */
  async _transmitFrame(frameData) {
    const frame = frameData.frame || frameData;

    // Serialize message
    const serialized = new TextEncoder().encode(JSON.stringify(frame));

    // Create protocol frame
    const protocolFrame = this.encoding.createFrame(serialized, {
      type: frame.type || MESSAGE_TYPES.DATA
    });

    // Apply FEC
    const withFEC = this.encoding.applyFEC(protocolFrame);

    // Modulate
    const audioSamples = this.physical.modulate(withFEC);

    // Transmit
    this._setState(DEVICE_STATES.TRANSMITTING);
    await this.audioIO.transmit(audioSamples);
    this._setState(DEVICE_STATES.IDLE);
  }

  /**
   * Internal: Handle incoming audio
   */
  _handleIncomingAudio(samples) {
    // Process through signal processor
    const processed = this.signalProcessor.process(samples);

    // Accumulate samples
    this.receiveBuffer.push(...processed);

    // Try to demodulate
    if (this.receiveBuffer.length >= this.audioIO.sampleRate * 0.5) {
      this._tryDemodulate();
    }
  }

  /**
   * Internal: Try to demodulate received audio
   */
  _tryDemodulate() {
    const samples = new Float32Array(this.receiveBuffer);
    this.receiveBuffer = [];

    const result = this.physical.demodulate(samples);

    if (result.data && result.confidence > 0.5) {
      this._setState(DEVICE_STATES.RECEIVING);

      // Decode FEC
      const decoded = this.encoding.decodeFEC(result.data);

      // Parse frame
      const frame = this.encoding.parseFrame(decoded);

      if (frame.valid) {
        this._handleReceivedFrame(frame);
        this.performanceStats.totalBytesReceived += frame.payloadLength;
      }

      this._setState(DEVICE_STATES.IDLE);
    }
  }

  /**
   * Internal: Handle received frame
   */
  _handleReceivedFrame(frame) {
    try {
      const payloadStr = new TextDecoder().decode(frame.payload);
      const message = JSON.parse(payloadStr);

      // Process through MAC layer
      this.mac.receiveFrame(frame);

      // Process through mesh
      const result = this.mesh.handleMessage(message);

      // Handle beacons
      if (message.type === MESSAGE_TYPES.BEACON) {
        this.discovery.processBeacon(message);
      }

      // Send ACK if needed
      if (result.ack) {
        this.mac.queueFrame(result.ack, 10); // High priority for ACKs
      }

      // Forward if needed
      if (result.forward) {
        this.mac.queueFrame(result.forward.message);
      }
    } catch (e) {
      // Invalid frame, ignore
    }
  }

  /**
   * Internal: Send beacon
   */
  async _sendBeacon() {
    const beaconData = this.discovery.getBeaconData();
    const frame = this.encoding.createFrame(beaconData, {
      type: MESSAGE_TYPES.BEACON
    });

    const audioSamples = this.physical.modulate(frame);
    await this.audioIO.transmit(audioSamples, { volume: 0.8 });
  }

  /**
   * Internal: Send stream chunk
   */
  async _sendStreamChunk(streamId, chunk) {
    const result = this.mesh.sendStreamData(streamId, chunk);
    if (result.success) {
      for (const targetId of result.targets) {
        await this._sendData(targetId, chunk, {
          streamId: streamId,
          type: MESSAGE_TYPES.STREAM_DATA
        });
      }
    }
    return result;
  }

  /**
   * Internal: End stream
   */
  _endStream(streamId) {
    return this.mesh.endStream(streamId);
  }

  /**
   * Internal: Set state
   */
  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    if (this.onStateChange && oldState !== newState) {
      this.onStateChange(newState, oldState);
    }
  }

  /**
   * Get connected devices
   */
  getDevices() {
    return this.discovery.getDevices();
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId) {
    return this.discovery.getDevice(deviceId);
  }

  /**
   * Get current state
   */
  getState() {
    return this.state;
  }

  /**
   * Get comprehensive statistics
   */
  getStats() {
    const runtime = this.performanceStats.startTime
      ? (Date.now() - this.performanceStats.startTime) / 1000
      : 0;

    return {
      deviceId: this.deviceId,
      state: this.state,
      runtime: runtime,
      devices: this.discovery.getDeviceCount(),
      dataRate: this.physical.getDataRate(),
      performance: {
        ...this.performanceStats,
        avgThroughput: runtime > 0 ? this.performanceStats.totalBytesSent / runtime : 0
      },
      physical: this.physical.getStats(),
      mac: this.mac.getStats(),
      encoding: this.encoding.getStats(),
      mesh: this.mesh.getStats(),
      security: this.security.getStatus(),
      signalProcessor: this.signalProcessor.getStats(),
      audio: this.audioIO.getStats()
    };
  }

  /**
   * Play test tone (for debugging)
   */
  async playTestTone(frequency, duration) {
    return this.audioIO.playTestTone(frequency, duration);
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stop();
    this.audioIO.dispose();
    this.mac.dispose();
    this.discovery.dispose();
    this.mesh.dispose();
    this.security.dispose();
  }
}

// Factory method
AcousticMesh.create = (options = {}) => {
  return new AcousticMesh(options);
};

// Export all components
export {
  ACOUSTIC_CONFIG,
  MESSAGE_TYPES,
  DEVICE_STATES,
  STREAM_TYPES,
  SECURITY_CONFIG,
  AudioIO,
  DeviceDiscovery,
  MeshCoordinator,
  PhysicalLayer,
  MACLayer,
  EncodingLayer,
  SecurityLayer,
  SignalProcessor
};

export default AcousticMesh;
