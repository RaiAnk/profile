/**
 * AcousticTalk SDK - Constants and Configuration
 * Infrastructure-free, zero-config acoustic mesh networking
 */

export const ACOUSTIC_CONFIG = {
  // Frequency bands (Hz)
  ULTRASONIC: {
    BASE_FREQ: 18000,      // Base frequency for ultrasonic (inaudible to most humans)
    FREQ_SPACING: 100,     // Hz between each symbol
    NUM_FREQUENCIES: 16,   // 16-FSK for higher data rate
    BANDWIDTH: 1600        // Total bandwidth used
  },

  AUDIBLE: {
    BASE_FREQ: 1000,       // Base frequency for audible mode
    FREQ_SPACING: 200,     // Hz between each symbol
    NUM_FREQUENCIES: 8,    // 8-FSK for audible
    BANDWIDTH: 1600
  },

  // Timing parameters
  SYMBOL_DURATION: 0.01,   // 10ms per symbol (100 symbols/sec)
  GUARD_INTERVAL: 0.002,   // 2ms guard between symbols
  PREAMBLE_DURATION: 0.1,  // 100ms preamble for sync

  // Sample rates
  SAMPLE_RATE: 44100,      // Standard audio sample rate
  FFT_SIZE: 2048,          // FFT window size for detection

  // Protocol
  FRAME_HEADER_SIZE: 8,    // bytes
  MAX_PAYLOAD_SIZE: 256,   // bytes per frame
  CRC_SIZE: 4,             // bytes

  // TDMA Slot configuration
  SLOT_DURATION: 50,       // ms per slot
  SLOTS_PER_FRAME: 20,     // 20 slots per TDMA frame
  FRAME_DURATION: 1000,    // 1 second per frame

  // Discovery
  BEACON_INTERVAL: 2000,   // ms between beacons
  DEVICE_TIMEOUT: 10000,   // ms before device considered offline

  // Error correction
  FEC_RATE: 0.5,           // Forward Error Correction rate (Reed-Solomon)
  INTERLEAVE_DEPTH: 8,     // Symbol interleaving depth

  // AI/Signal Processing
  NOISE_FLOOR_DB: -60,     // dB threshold for noise
  SNR_THRESHOLD: 10,       // Minimum SNR for reliable decode
  DOPPLER_COMPENSATION: true,
  ECHO_CANCELLATION: true
};

export const MESSAGE_TYPES = {
  BEACON: 0x01,
  DATA: 0x02,
  ACK: 0x03,
  NACK: 0x04,
  DISCOVERY: 0x05,
  SLOT_REQUEST: 0x06,
  SLOT_GRANT: 0x07,
  KEY_EXCHANGE: 0x08,
  CHALLENGE: 0x09,
  RESPONSE: 0x0A,
  STREAM_START: 0x0B,
  STREAM_DATA: 0x0C,
  STREAM_END: 0x0D,
  MESH_SYNC: 0x0E,
  PRIORITY_CLAIM: 0x0F
};

export const DEVICE_STATES = {
  INITIALIZING: 'initializing',
  SCANNING: 'scanning',
  DISCOVERED: 'discovered',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  TRANSMITTING: 'transmitting',
  RECEIVING: 'receiving',
  IDLE: 'idle',
  ERROR: 'error',
  OFFLINE: 'offline'
};

export const STREAM_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  BINARY: 'binary',
  JSON: 'json'
};

export const SECURITY_CONFIG = {
  KEY_SIZE: 256,           // bits
  KEY_ROTATION_INTERVAL: 60000, // ms
  CHALLENGE_SIZE: 32,      // bytes
  FINGERPRINT_SAMPLES: 10, // samples for acoustic fingerprint
  MAX_AUTH_ATTEMPTS: 3
};

export const MODULATION_MODES = {
  FSK: 'fsk',              // Frequency Shift Keying
  OFDM: 'ofdm',            // Orthogonal Frequency Division (future)
  CHIRP: 'chirp'           // Chirp spread spectrum (future)
};
