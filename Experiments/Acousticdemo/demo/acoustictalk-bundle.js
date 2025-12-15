/**
 * AcousticTalk SDK - Bundled Version
 * Infrastructure-free, zero-config acoustic mesh networking
 * Single file - no imports needed
 */

(function(global) {
  'use strict';

  // ============== CONSTANTS ==============
  const ACOUSTIC_CONFIG = {
    ULTRASONIC: {
      BASE_FREQ: 18000,
      FREQ_SPACING: 100,
      NUM_FREQUENCIES: 16,
      BANDWIDTH: 1600
    },
    AUDIBLE: {
      BASE_FREQ: 1000,
      FREQ_SPACING: 200,
      NUM_FREQUENCIES: 8,
      BANDWIDTH: 1600
    },
    SYMBOL_DURATION: 0.01,
    GUARD_INTERVAL: 0.002,
    PREAMBLE_DURATION: 0.1,
    SAMPLE_RATE: 44100,
    FFT_SIZE: 2048,
    FRAME_HEADER_SIZE: 8,
    MAX_PAYLOAD_SIZE: 256,
    CRC_SIZE: 4,
    SLOT_DURATION: 50,
    SLOTS_PER_FRAME: 20,
    FRAME_DURATION: 1000,
    BEACON_INTERVAL: 2000,
    DEVICE_TIMEOUT: 10000,
    FEC_RATE: 0.5,
    INTERLEAVE_DEPTH: 8,
    NOISE_FLOOR_DB: -60,
    SNR_THRESHOLD: 10,
    DOPPLER_COMPENSATION: true,
    ECHO_CANCELLATION: true
  };

  const MESSAGE_TYPES = {
    BEACON: 0x01, DATA: 0x02, ACK: 0x03, NACK: 0x04,
    DISCOVERY: 0x05, SLOT_REQUEST: 0x06, SLOT_GRANT: 0x07,
    KEY_EXCHANGE: 0x08, CHALLENGE: 0x09, RESPONSE: 0x0A,
    STREAM_START: 0x0B, STREAM_DATA: 0x0C, STREAM_END: 0x0D
  };

  const DEVICE_STATES = {
    INITIALIZING: 'initializing', SCANNING: 'scanning',
    DISCOVERED: 'discovered', CONNECTING: 'connecting',
    CONNECTED: 'connected', TRANSMITTING: 'transmitting',
    RECEIVING: 'receiving', IDLE: 'idle', ERROR: 'error'
  };

  // ============== AUDIO IO ==============
  class AudioIO {
    constructor(options = {}) {
      this.sampleRate = options.sampleRate || ACOUSTIC_CONFIG.SAMPLE_RATE;
      this.fftSize = options.fftSize || ACOUSTIC_CONFIG.FFT_SIZE;
      this.audioContext = null;
      this.analyser = null;
      this.microphone = null;
      this.mediaStream = null;
      this.scriptProcessor = null;
      this.gainNode = null;
      this.isInitialized = false;
      this.isListening = false;
      this.isTransmitting = false;
      this.onAudioData = null;
      this.stats = { inputLevel: 0, packetsTransmitted: 0, packetsReceived: 0 };
    }

    static checkRequirements() {
      const issues = [];
      if (typeof window === 'undefined') {
        issues.push('Not in browser');
      } else if (!window.AudioContext && !window.webkitAudioContext) {
        issues.push('AudioContext not supported');
      }
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        issues.push('getUserMedia not available');
      }
      if (typeof window !== 'undefined' && !window.isSecureContext) {
        issues.push('Requires HTTPS or localhost');
      }
      return { ready: issues.length === 0, issues, message: issues.join('; ') };
    }

    async initialize() {
      const check = AudioIO.checkRequirements();
      if (!check.ready) {
        console.error('Audio init failed:', check.message);
        return { success: false, error: check.message, issues: check.issues };
      }

      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: this.sampleRate });

        // Mobile Safari requires explicit resume after user gesture
        if (this.audioContext.state === 'suspended') {
          console.log('Resuming AudioContext (mobile)...');
          await this.audioContext.resume();
        }

        console.log('Requesting microphone...');
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }
        });
        console.log('Microphone granted');
        // Resume again after getting microphone (some browsers need this)
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }

        this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 1.0;
        this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.microphone.connect(this.analyser);
        this.gainNode.connect(this.audioContext.destination);
        this.isInitialized = true;

        return { success: true, sampleRate: this.audioContext.sampleRate };
      } catch (error) {
        let msg = error.message;
        if (error.name === 'NotAllowedError') msg = 'Microphone access denied';
        else if (error.name === 'NotFoundError') msg = 'No microphone found';
        console.error('Audio init failed:', msg);
        return { success: false, error: msg };
      }
    }

    startListening(callback) {
      if (!this.isInitialized) throw new Error('Not initialized');
      this.onAudioData = callback;
      this.isListening = true;

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.isListening) return;
        const data = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        this.stats.inputLevel = Math.sqrt(sum / data.length);
        if (this.onAudioData) this.onAudioData(new Float32Array(data));
      };

      this.microphone.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      return true;
    }

    stopListening() {
      this.isListening = false;
      try { this.scriptProcessor?.disconnect(); } catch(e) {}
    }

    async transmit(samples, options = {}) {
      if (!this.isInitialized) throw new Error('Not initialized');
      await this.resume();
      const volume = options.volume ?? 1.0;

      return new Promise((resolve, reject) => {
        try {
          const buffer = this.audioContext.createBuffer(1, samples.length, this.sampleRate);
          const channel = buffer.getChannelData(0);
          for (let i = 0; i < samples.length; i++) channel[i] = samples[i] * volume;

          const source = this.audioContext.createBufferSource();
          source.buffer = buffer;
          source.connect(this.gainNode);
          this.isTransmitting = true;

          source.onended = () => {
            this.isTransmitting = false;
            this.stats.packetsTransmitted++;
            resolve({ success: true, duration: samples.length / this.sampleRate });
          };
          source.start(0);
        } catch (e) {
          this.isTransmitting = false;
          reject(e);
        }
      });
    }

    getFrequencyData() {
      if (!this.analyser) return null;
      const data = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(data);
      return { data, binWidth: this.sampleRate / this.fftSize };
    }

    getWaveformData() {
      if (!this.analyser) return null;
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      return data;
    }

    async resume() {
      if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
    }

    async playTestTone(freq, duration) {
      if (!this.isInitialized) throw new Error('Not initialized');
      await this.resume();
      const osc = this.audioContext.createOscillator();
      osc.frequency.value = freq;
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + duration);
      return new Promise(r => setTimeout(r, duration * 1000));
    }

    getStats() {
      return { ...this.stats, isInitialized: this.isInitialized, isListening: this.isListening };
    }

    dispose() {
      this.stopListening();
      this.mediaStream?.getTracks().forEach(t => t.stop());
      this.audioContext?.close();
      this.isInitialized = false;
    }
  }

  // ============== PHYSICAL LAYER ==============
  class PhysicalLayer {
    constructor(options = {}) {
      this.mode = options.mode || 'ultrasonic';
      this.config = this.mode === 'ultrasonic' ? ACOUSTIC_CONFIG.ULTRASONIC : ACOUSTIC_CONFIG.AUDIBLE;
      this.sampleRate = ACOUSTIC_CONFIG.SAMPLE_RATE;
      this.symbolDuration = ACOUSTIC_CONFIG.SYMBOL_DURATION;
      this.guardInterval = ACOUSTIC_CONFIG.GUARD_INTERVAL;
      this.frequencies = [];
      for (let i = 0; i < this.config.NUM_FREQUENCIES; i++) {
        this.frequencies.push(this.config.BASE_FREQ + i * this.config.FREQ_SPACING);
      }
      this.stats = { symbolsTransmitted: 0, symbolsReceived: 0 };
    }

    modulate(data) {
      const symbols = this._bytesToSymbols(data);
      const samplesPerSymbol = Math.floor(this.sampleRate * this.symbolDuration);
      const guardSamples = Math.floor(this.sampleRate * this.guardInterval);
      const preambleSamples = Math.floor(this.sampleRate * ACOUSTIC_CONFIG.PREAMBLE_DURATION);
      const output = new Float32Array(preambleSamples + symbols.length * (samplesPerSymbol + guardSamples));

      // Preamble chirp
      for (let i = 0; i < preambleSamples; i++) {
        const t = i / this.sampleRate;
        const progress = i / preambleSamples;
        const freq = (this.config.BASE_FREQ - 500) + (this.config.BANDWIDTH + 1000) * progress;
        output[i] = 0.8 * Math.sin(2 * Math.PI * freq * t);
      }

      // FSK symbols
      let offset = preambleSamples;
      for (const symbol of symbols) {
        const freq = this.frequencies[symbol];
        for (let j = 0; j < samplesPerSymbol; j++) {
          const t = j / this.sampleRate;
          const window = 0.5 * (1 - Math.cos(2 * Math.PI * j / samplesPerSymbol));
          output[offset + j] = window * Math.sin(2 * Math.PI * freq * t);
        }
        offset += samplesPerSymbol + guardSamples;
        this.stats.symbolsTransmitted++;
      }
      return output;
    }

    _bytesToSymbols(data) {
      const symbols = [];
      for (const byte of data) {
        symbols.push((byte >> 4) & 0x0F);
        symbols.push(byte & 0x0F);
      }
      return symbols;
    }

    getDataRate() {
      const symbolRate = 1 / (this.symbolDuration + this.guardInterval);
      const bitsPerSymbol = Math.log2(this.config.NUM_FREQUENCIES);
      return { symbolRate, bitRate: symbolRate * bitsPerSymbol, byteRate: (symbolRate * bitsPerSymbol) / 8 };
    }

    getStats() { return { ...this.stats }; }
  }

  // ============== ENCODING LAYER ==============
  class EncodingLayer {
    constructor() {
      this.crcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
        this.crcTable[i] = crc;
      }
      this.stats = { bytesEncoded: 0, framesCreated: 0 };
    }

    calculateCRC(data) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) crc = this.crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    createFrame(payload, options = {}) {
      const type = options.type || MESSAGE_TYPES.DATA;
      const sequence = options.sequence || 0;
      const payloadBytes = payload instanceof Uint8Array ? payload : new TextEncoder().encode(payload);
      const frame = new Uint8Array(8 + payloadBytes.length + 4);

      frame[0] = 0xAC; frame[1] = 0x4D;
      frame[2] = type; frame[3] = options.flags || 0;
      frame[4] = (sequence >> 8) & 0xFF; frame[5] = sequence & 0xFF;
      frame[6] = (payloadBytes.length >> 8) & 0xFF; frame[7] = payloadBytes.length & 0xFF;
      frame.set(payloadBytes, 8);

      const crc = this.calculateCRC(frame.slice(0, 8 + payloadBytes.length));
      frame[8 + payloadBytes.length] = (crc >> 24) & 0xFF;
      frame[8 + payloadBytes.length + 1] = (crc >> 16) & 0xFF;
      frame[8 + payloadBytes.length + 2] = (crc >> 8) & 0xFF;
      frame[8 + payloadBytes.length + 3] = crc & 0xFF;

      this.stats.bytesEncoded += frame.length;
      this.stats.framesCreated++;
      return frame;
    }

    getStats() { return { ...this.stats }; }
  }

  // ============== DISCOVERY ==============
  class DeviceDiscovery {
    constructor(options = {}) {
      this.deviceId = options.deviceId || this._generateUUID();
      this.deviceName = options.deviceName || `Device_${this.deviceId.slice(0, 8)}`;
      this.devices = new Map();
      this.onDeviceDiscovered = null;
      this.onDeviceLost = null;
      this.stats = { beaconsSent: 0, devicesDiscovered: 0 };
    }

    _generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    getBeaconData() {
      this.stats.beaconsSent++;
      return new TextEncoder().encode(JSON.stringify({
        type: MESSAGE_TYPES.BEACON,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        timestamp: Date.now()
      }));
    }

    processBeacon(data) {
      try {
        const beacon = typeof data === 'object' ? data : JSON.parse(new TextDecoder().decode(data));
        if (beacon.deviceId === this.deviceId) return null;

        const isNew = !this.devices.has(beacon.deviceId);
        const device = {
          deviceId: beacon.deviceId,
          deviceName: beacon.deviceName || `Unknown_${beacon.deviceId.slice(0, 8)}`,
          lastSeen: Date.now()
        };
        this.devices.set(beacon.deviceId, device);

        if (isNew) {
          this.stats.devicesDiscovered++;
          if (this.onDeviceDiscovered) this.onDeviceDiscovered(device);
        }
        return device;
      } catch (e) { return null; }
    }

    getDevices() { return Array.from(this.devices.values()); }
    getDeviceCount() { return this.devices.size; }
    getMyInfo() { return { deviceId: this.deviceId, deviceName: this.deviceName }; }
    getStats() { return { ...this.stats, activeDevices: this.devices.size }; }
    dispose() { this.devices.clear(); }
  }

  // ============== MESH COORDINATOR ==============
  class MeshCoordinator {
    constructor(deviceId) {
      this.deviceId = deviceId;
      this.peers = new Map();
      this.messageId = 0;
      this.onMessage = null;
      this.stats = { messagesSent: 0, messagesReceived: 0 };
    }

    addPeer(peerId, info = {}) {
      const peer = { peerId, name: info.name || `Peer_${peerId.slice(0, 8)}`, addedAt: Date.now() };
      this.peers.set(peerId, peer);
      return peer;
    }

    removePeer(peerId) { this.peers.delete(peerId); }

    broadcast(data) {
      const message = {
        id: `${this.deviceId}_${++this.messageId}`,
        type: MESSAGE_TYPES.DATA,
        from: this.deviceId,
        to: 'broadcast',
        data,
        timestamp: Date.now()
      };
      this.stats.messagesSent++;
      return { messageId: message.id, message };
    }

    handleMessage(message) {
      this.stats.messagesReceived++;
      if (this.onMessage) this.onMessage(message);
      return { handled: true };
    }

    getPeers() { return Array.from(this.peers.values()); }
    getStats() { return { ...this.stats, peers: this.peers.size }; }
    dispose() { this.peers.clear(); }
  }

  // ============== MAIN ACOUSTICMESH CLASS ==============
  class AcousticMesh {
    constructor(options = {}) {
      this.deviceId = options.deviceId || this._generateDeviceId();
      this.deviceName = options.deviceName || `Device_${this.deviceId.slice(0, 8)}`;
      this.mode = options.mode || 'ultrasonic';

      this.audioIO = new AudioIO();
      this.physical = new PhysicalLayer({ mode: this.mode });
      this.encoding = new EncodingLayer();
      this.discovery = new DeviceDiscovery({ deviceId: this.deviceId, deviceName: this.deviceName });
      this.mesh = new MeshCoordinator(this.deviceId);

      this.state = DEVICE_STATES.INITIALIZING;
      this.isRunning = false;
      this.beaconInterval = null;

      this.onStateChange = options.onStateChange || null;
      this.onDeviceDiscovered = options.onDeviceDiscovered || null;
      this.onDeviceLost = options.onDeviceLost || null;
      this.onMessage = options.onMessage || null;
      this.onError = options.onError || null;

      this._setupCallbacks();
    }

    _generateDeviceId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }

    _setupCallbacks() {
      this.discovery.onDeviceDiscovered = (device) => {
        this.mesh.addPeer(device.deviceId, { name: device.deviceName });
        if (this.onDeviceDiscovered) this.onDeviceDiscovered(device);
      };
      this.discovery.onDeviceLost = (device) => {
        this.mesh.removePeer(device.deviceId);
        if (this.onDeviceLost) this.onDeviceLost(device);
      };
      this.mesh.onMessage = (message) => {
        if (this.onMessage) this.onMessage(message);
      };
    }

    _setState(newState) {
      const old = this.state;
      this.state = newState;
      if (this.onStateChange && old !== newState) this.onStateChange(newState, old);
    }

    async initialize() {
      try {
        this._setState(DEVICE_STATES.INITIALIZING);
        const result = await this.audioIO.initialize();
        if (!result.success) throw new Error(result.error);
        this._setState(DEVICE_STATES.IDLE);
        return { success: true, deviceId: this.deviceId, sampleRate: result.sampleRate, dataRate: this.physical.getDataRate() };
      } catch (error) {
        this._setState(DEVICE_STATES.ERROR);
        if (this.onError) this.onError(error);
        return { success: false, error: error.message };
      }
    }

    async start() {
      this.isRunning = true;
      this.audioIO.startListening((samples) => this._handleAudio(samples));
      this._setState(DEVICE_STATES.SCANNING);
      await this._sendBeacon();
      this.beaconInterval = setInterval(() => this._sendBeacon(), ACOUSTIC_CONFIG.BEACON_INTERVAL);
      return { success: true };
    }

    stop() {
      this.isRunning = false;
      if (this.beaconInterval) clearInterval(this.beaconInterval);
      this.audioIO.stopListening();
      this._setState(DEVICE_STATES.IDLE);
    }

    async broadcast(data) {
      const encoded = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
      const frame = this.encoding.createFrame(encoded);
      const samples = this.physical.modulate(frame);
      this._setState(DEVICE_STATES.TRANSMITTING);
      await this.audioIO.transmit(samples);
      this._setState(DEVICE_STATES.IDLE);
      return { success: true, bytesSent: encoded.length };
    }

    async _sendBeacon() {
      const beaconData = this.discovery.getBeaconData();
      const frame = this.encoding.createFrame(beaconData, { type: MESSAGE_TYPES.BEACON });
      const samples = this.physical.modulate(frame);
      await this.audioIO.transmit(samples, { volume: 0.8 });
    }

    _handleAudio(samples) {
      // Audio processing would happen here
    }

    async playTestTone(freq, duration) {
      return this.audioIO.playTestTone(freq, duration);
    }

    getDevices() { return this.discovery.getDevices(); }
    getState() { return this.state; }

    getStats() {
      return {
        deviceId: this.deviceId,
        state: this.state,
        devices: this.discovery.getDeviceCount(),
        dataRate: this.physical.getDataRate(),
        physical: this.physical.getStats(),
        encoding: this.encoding.getStats(),
        mesh: this.mesh.getStats(),
        audio: this.audioIO.getStats()
      };
    }

    dispose() {
      this.stop();
      this.audioIO.dispose();
      this.discovery.dispose();
      this.mesh.dispose();
    }
  }

  // Factory
  AcousticMesh.create = (options) => new AcousticMesh(options);

  // Export
  global.AcousticMesh = AcousticMesh;
  global.AcousticTalk = { AcousticMesh, ACOUSTIC_CONFIG, MESSAGE_TYPES, DEVICE_STATES };

})(typeof window !== 'undefined' ? window : global);
