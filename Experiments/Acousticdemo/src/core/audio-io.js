/**
 * AcousticTalk SDK - Audio I/O Layer
 * Web Audio API interface for acoustic communication
 */

import { ACOUSTIC_CONFIG } from './constants.js';

export class AudioIO {
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

    // Callbacks
    this.onAudioData = null;
    this.onFrequencyData = null;
    this.onError = null;

    // Buffers
    this.inputBuffer = [];
    this.outputQueue = [];

    // Statistics
    this.stats = {
      inputLevel: 0,
      outputLevel: 0,
      latency: 0,
      packetsTransmitted: 0,
      packetsReceived: 0
    };

    // Echo cancellation buffer
    this.echoBuffer = new Float32Array(this.sampleRate * 2);
    this.echoBufferIndex = 0;
  }

  /**
   * Check if audio APIs are available and provide helpful message
   */
  static checkRequirements() {
    const issues = [];

    // Check AudioContext
    if (typeof window === 'undefined') {
      issues.push('Not running in browser');
    } else if (!window.AudioContext && !window.webkitAudioContext) {
      issues.push('AudioContext not supported');
    }

    // Check getUserMedia
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      issues.push('getUserMedia not available');
    }

    // Check secure context
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const protocol = window.location?.protocol || '';
      if (protocol === 'file:') {
        issues.push('Cannot use file:// protocol - microphone requires HTTP server');
      } else {
        issues.push('Not a secure context - requires HTTPS or localhost');
      }
    }

    return {
      ready: issues.length === 0,
      issues: issues,
      message: issues.length === 0
        ? 'Ready'
        : `Requirements not met: ${issues.join('; ')}. Run: node server.js then open http://localhost:3000/demo/`
    };
  }

  /**
   * Initialize audio context and request microphone access
   */
  async initialize() {
    // Check requirements first
    const check = AudioIO.checkRequirements();
    if (!check.ready) {
      console.error('❌ Audio initialization failed:', check.message);
      console.error('');
      console.error('🔧 To fix this:');
      console.error('   1. Open terminal in SDK folder');
      console.error('   2. Run: node server.js');
      console.error('   3. Open: http://localhost:3000/demo/');
      console.error('');
      return {
        success: false,
        error: check.message,
        issues: check.issues
      };
    }

    try {
      // Create audio context
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: this.sampleRate,
        latencyHint: 'interactive'
      });

      // Request microphone access
      console.log('🎤 Requesting microphone access...');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: ACOUSTIC_CONFIG.ECHO_CANCELLATION,
          noiseSuppression: true,
          autoGainControl: false,
          channelCount: 1,
          sampleRate: this.sampleRate
        }
      });
      console.log('✓ Microphone access granted');

      // Create nodes
      this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Analyser for frequency detection
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.fftSize;
      this.analyser.smoothingTimeConstant = 0.1;

      // Gain node for output volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      // Script processor for raw audio access
      const bufferSize = 4096;
      this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      // Connect nodes
      this.microphone.connect(this.analyser);
      this.gainNode.connect(this.audioContext.destination);

      this.isInitialized = true;

      // Calculate actual latency
      this.stats.latency = (bufferSize / this.sampleRate) * 1000;

      console.log('✓ Audio initialized successfully');
      console.log(`  Sample rate: ${this.audioContext.sampleRate} Hz`);
      console.log(`  Latency: ${this.stats.latency.toFixed(1)} ms`);

      return {
        success: true,
        sampleRate: this.audioContext.sampleRate,
        latency: this.stats.latency
      };
    } catch (error) {
      let helpfulMessage = error.message;

      if (error.name === 'NotAllowedError') {
        helpfulMessage = 'Microphone access denied. Please allow microphone permission and reload the page.';
      } else if (error.name === 'NotFoundError') {
        helpfulMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        helpfulMessage = 'Microphone is in use by another application.';
      }

      console.error('❌ Audio initialization failed:', helpfulMessage);

      if (this.onError) {
        this.onError(new Error(helpfulMessage));
      }

      return { success: false, error: helpfulMessage };
    }
  }

  /**
   * Start listening for incoming acoustic signals
   */
  startListening(callback) {
    if (!this.isInitialized) {
      throw new Error('Audio not initialized. Call initialize() first.');
    }

    this.onAudioData = callback;
    this.isListening = true;

    // Set up audio processing
    this.scriptProcessor.onaudioprocess = (event) => {
      if (!this.isListening) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Store in echo buffer for cancellation
      for (let i = 0; i < inputData.length; i++) {
        this.echoBuffer[this.echoBufferIndex] = inputData[i];
        this.echoBufferIndex = (this.echoBufferIndex + 1) % this.echoBuffer.length;
      }

      // Calculate input level
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += inputData[i] * inputData[i];
      }
      this.stats.inputLevel = Math.sqrt(sum / inputData.length);

      // Callback with audio data
      if (this.onAudioData) {
        this.onAudioData(new Float32Array(inputData));
      }
    };

    this.microphone.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);

    return true;
  }

  /**
   * Stop listening
   */
  stopListening() {
    this.isListening = false;
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }

  /**
   * Transmit audio samples
   * @param {Float32Array} samples - Audio samples to transmit
   * @param {Object} options - Transmission options
   */
  async transmit(samples, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Audio not initialized. Call initialize() first.');
    }

    // Resume context if needed
    await this.resume();

    const volume = options.volume !== undefined ? options.volume : 1.0;

    return new Promise((resolve, reject) => {
      try {
        // Create audio buffer
        const audioBuffer = this.audioContext.createBuffer(
          1,
          samples.length,
          this.sampleRate
        );

        // Copy samples to buffer
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          channelData[i] = samples[i] * volume;
        }

        // Create buffer source
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;

        // Connect to gain node (and then to destination)
        source.connect(this.gainNode);

        // Track transmission state
        this.isTransmitting = true;

        source.onended = () => {
          this.isTransmitting = false;
          this.stats.packetsTransmitted++;
          resolve({
            success: true,
            duration: samples.length / this.sampleRate,
            samplesTransmitted: samples.length
          });
        };

        // Start playback
        source.start(0);

      } catch (error) {
        this.isTransmitting = false;
        reject(error);
      }
    });
  }

  /**
   * Get frequency spectrum data
   * @returns {Object} - Frequency data with magnitudes
   */
  getFrequencyData() {
    if (!this.analyser) return null;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Convert to frequency/magnitude pairs
    const frequencies = [];
    const binWidth = this.sampleRate / this.fftSize;

    for (let i = 0; i < bufferLength; i++) {
      frequencies.push({
        frequency: i * binWidth,
        magnitude: dataArray[i] / 255.0,
        db: (dataArray[i] / 255.0) * 100 - 100
      });
    }

    return {
      data: dataArray,
      frequencies: frequencies,
      binWidth: binWidth,
      nyquist: this.sampleRate / 2
    };
  }

  /**
   * Get time-domain waveform data
   * @returns {Float32Array} - Waveform samples
   */
  getWaveformData() {
    if (!this.analyser) return null;

    const bufferLength = this.analyser.fftSize;
    const dataArray = new Float32Array(bufferLength);
    this.analyser.getFloatTimeDomainData(dataArray);

    return dataArray;
  }

  /**
   * Set output volume
   * @param {number} volume - Volume level (0.0 to 1.0)
   */
  setVolume(volume) {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Get current audio statistics
   */
  getStats() {
    return {
      ...this.stats,
      isInitialized: this.isInitialized,
      isListening: this.isListening,
      isTransmitting: this.isTransmitting,
      sampleRate: this.audioContext?.sampleRate || 0,
      contextState: this.audioContext?.state || 'closed'
    };
  }

  /**
   * Resume audio context (required after user interaction)
   */
  async resume() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Record audio for specified duration
   * @param {number} duration - Duration in seconds
   * @returns {Float32Array} - Recorded samples
   */
  async record(duration) {
    return new Promise((resolve) => {
      const samples = [];
      const totalSamples = Math.floor(this.sampleRate * duration);

      const originalCallback = this.onAudioData;

      this.onAudioData = (data) => {
        samples.push(...data);

        if (samples.length >= totalSamples) {
          this.onAudioData = originalCallback;
          resolve(new Float32Array(samples.slice(0, totalSamples)));
        }
      };

      if (!this.isListening) {
        this.startListening(() => { });
      }
    });
  }

  /**
   * Play a test tone
   * @param {number} frequency - Frequency in Hz
   * @param {number} duration - Duration in seconds
   */
  async playTestTone(frequency, duration) {
    if (!this.isInitialized) {
      throw new Error('Audio not initialized');
    }

    // Resume audio context if needed
    await this.resume();

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + duration);

    return new Promise(resolve => setTimeout(resolve, duration * 1000));
  }

  /**
   * Clean up resources
   */
  dispose() {
    this.stopListening();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    this.isInitialized = false;
  }
}

export default AudioIO;
