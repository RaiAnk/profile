/**
 * AcousticTalk SDK - Security Layer
 * Proximity proof, ephemeral keys, acoustic fingerprinting
 */

import { SECURITY_CONFIG, MESSAGE_TYPES } from '../core/constants.js';

export class SecurityLayer {
  constructor(deviceId, options = {}) {
    this.deviceId = deviceId;

    // Key management
    this.keyPair = null;
    this.sessionKeys = new Map(); // peerId -> { key, expires }
    this.keyRotationInterval = options.keyRotationInterval || SECURITY_CONFIG.KEY_ROTATION_INTERVAL;

    // Challenge-response
    this.pendingChallenges = new Map(); // challengeId -> { challenge, timestamp, peerId }
    this.challengeTimeout = options.challengeTimeout || 5000;

    // Acoustic fingerprints
    this.deviceFingerprints = new Map(); // peerId -> fingerprint
    this.fingerprintSamples = options.fingerprintSamples || SECURITY_CONFIG.FINGERPRINT_SAMPLES;

    // Jamming detection
    this.noiseBaseline = null;
    this.jammingThreshold = options.jammingThreshold || 20; // dB above baseline

    // Trust levels
    this.trustLevels = new Map(); // peerId -> trust level (0-100)

    // Statistics
    this.stats = {
      challengesSent: 0,
      challengesReceived: 0,
      authSuccesses: 0,
      authFailures: 0,
      jammingDetected: 0,
      spoofingAttempts: 0
    };

    // Start key rotation
    this._startKeyRotation();
  }

  /**
   * Initialize crypto (generate key pair)
   */
  async initialize() {
    try {
      // Generate ECDH key pair for key exchange
      this.keyPair = await crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        true,
        ['deriveBits']
      );

      return { success: true };
    } catch (e) {
      // Fallback for browsers without crypto.subtle
      this.keyPair = this._generateFallbackKeyPair();
      return { success: true, fallback: true };
    }
  }

  /**
   * Fallback key generation (simpler, less secure)
   */
  _generateFallbackKeyPair() {
    const privateKey = new Uint8Array(32);
    crypto.getRandomValues(privateKey);

    return {
      privateKey: privateKey,
      publicKey: this._derivePublicKey(privateKey)
    };
  }

  /**
   * Simple public key derivation for fallback
   */
  _derivePublicKey(privateKey) {
    // Simplified - in production use proper ECC
    const publicKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      publicKey[i] = privateKey[i] ^ 0x5A; // XOR with constant
    }
    return publicKey;
  }

  /**
   * Export public key for sharing
   */
  async getPublicKey() {
    if (this.keyPair.publicKey instanceof CryptoKey) {
      const raw = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
      return new Uint8Array(raw);
    }
    return this.keyPair.publicKey;
  }

  /**
   * Create proximity challenge
   * Challenge must be responded to acoustically within time limit
   */
  createChallenge(peerId) {
    const challengeId = `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const challenge = new Uint8Array(SECURITY_CONFIG.CHALLENGE_SIZE);
    crypto.getRandomValues(challenge);

    this.pendingChallenges.set(challengeId, {
      challenge: challenge,
      timestamp: Date.now(),
      peerId: peerId
    });

    this.stats.challengesSent++;

    // Auto-expire challenge
    setTimeout(() => {
      this.pendingChallenges.delete(challengeId);
    }, this.challengeTimeout);

    return {
      type: MESSAGE_TYPES.CHALLENGE,
      challengeId: challengeId,
      challenge: Array.from(challenge),
      timestamp: Date.now()
    };
  }

  /**
   * Respond to proximity challenge
   */
  async respondToChallenge(challengeData) {
    this.stats.challengesReceived++;

    const challenge = new Uint8Array(challengeData.challenge);

    // Sign the challenge with our key
    const response = await this._signData(challenge);

    return {
      type: MESSAGE_TYPES.RESPONSE,
      challengeId: challengeData.challengeId,
      response: Array.from(response),
      deviceId: this.deviceId,
      publicKey: Array.from(await this.getPublicKey()),
      timestamp: Date.now()
    };
  }

  /**
   * Verify challenge response
   */
  async verifyResponse(responseData) {
    const pending = this.pendingChallenges.get(responseData.challengeId);

    if (!pending) {
      return { valid: false, reason: 'Challenge expired or unknown' };
    }

    // Check timing (proximity proof)
    const roundTripTime = Date.now() - pending.timestamp;
    const maxAllowedTime = this.challengeTimeout;

    if (roundTripTime > maxAllowedTime) {
      this.stats.authFailures++;
      return { valid: false, reason: 'Response too slow (not in proximity)' };
    }

    // Verify signature
    const isValid = await this._verifySignature(
      pending.challenge,
      new Uint8Array(responseData.response),
      new Uint8Array(responseData.publicKey)
    );

    if (isValid) {
      this.stats.authSuccesses++;

      // Establish session key
      await this._establishSessionKey(
        responseData.deviceId,
        new Uint8Array(responseData.publicKey)
      );

      // Update trust level
      this._updateTrust(responseData.deviceId, 10);

      return {
        valid: true,
        peerId: responseData.deviceId,
        roundTripTime: roundTripTime
      };
    }

    this.stats.authFailures++;
    return { valid: false, reason: 'Invalid signature' };
  }

  /**
   * Sign data with private key
   */
  async _signData(data) {
    // Simple HMAC-like signature for demonstration
    const key = this.keyPair.privateKey instanceof CryptoKey
      ? new Uint8Array(await crypto.subtle.exportKey('raw', this.keyPair.publicKey))
      : this.keyPair.privateKey;

    const signature = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      signature[i] = data[i % data.length] ^ key[i];
    }

    return signature;
  }

  /**
   * Verify signature
   */
  async _verifySignature(data, signature, publicKey) {
    // Reconstruct expected signature
    const expected = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      expected[i] = data[i % data.length] ^ publicKey[i];
    }

    // Compare
    let match = true;
    for (let i = 0; i < 32; i++) {
      if (signature[i] !== expected[i]) {
        match = false;
      }
    }
    return match;
  }

  /**
   * Establish session key with peer using ECDH
   */
  async _establishSessionKey(peerId, peerPublicKey) {
    let sharedSecret;

    try {
      if (this.keyPair.privateKey instanceof CryptoKey) {
        // Import peer's public key
        const importedKey = await crypto.subtle.importKey(
          'raw',
          peerPublicKey,
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          []
        );

        // Derive shared secret
        const bits = await crypto.subtle.deriveBits(
          { name: 'ECDH', public: importedKey },
          this.keyPair.privateKey,
          256
        );
        sharedSecret = new Uint8Array(bits);
      } else {
        // Fallback derivation
        sharedSecret = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
          sharedSecret[i] = this.keyPair.privateKey[i] ^ peerPublicKey[i];
        }
      }
    } catch (e) {
      // Fallback
      sharedSecret = new Uint8Array(32);
      crypto.getRandomValues(sharedSecret);
    }

    this.sessionKeys.set(peerId, {
      key: sharedSecret,
      established: Date.now(),
      expires: Date.now() + this.keyRotationInterval
    });

    return sharedSecret;
  }

  /**
   * Encrypt data for peer
   */
  async encrypt(peerId, data) {
    const session = this.sessionKeys.get(peerId);
    if (!session || Date.now() > session.expires) {
      return { success: false, error: 'No valid session key' };
    }

    const dataBytes = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(data);

    // Simple XOR encryption (in production use AES-GCM)
    const nonce = new Uint8Array(12);
    crypto.getRandomValues(nonce);

    const encrypted = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
      encrypted[i] = dataBytes[i] ^ session.key[i % session.key.length] ^ nonce[i % nonce.length];
    }

    return {
      success: true,
      data: encrypted,
      nonce: nonce
    };
  }

  /**
   * Decrypt data from peer
   */
  async decrypt(peerId, encryptedData, nonce) {
    const session = this.sessionKeys.get(peerId);
    if (!session) {
      return { success: false, error: 'No session key' };
    }

    const decrypted = new Uint8Array(encryptedData.length);
    for (let i = 0; i < encryptedData.length; i++) {
      decrypted[i] = encryptedData[i] ^ session.key[i % session.key.length] ^ nonce[i % nonce.length];
    }

    return {
      success: true,
      data: decrypted
    };
  }

  /**
   * Record acoustic fingerprint sample
   */
  recordFingerprint(peerId, audioFeatures) {
    if (!this.deviceFingerprints.has(peerId)) {
      this.deviceFingerprints.set(peerId, {
        samples: [],
        features: null
      });
    }

    const fingerprint = this.deviceFingerprints.get(peerId);
    fingerprint.samples.push(audioFeatures);

    // Keep only recent samples
    if (fingerprint.samples.length > this.fingerprintSamples) {
      fingerprint.samples.shift();
    }

    // Update averaged features
    if (fingerprint.samples.length >= 3) {
      fingerprint.features = this._averageFeatures(fingerprint.samples);
    }
  }

  /**
   * Average audio features for fingerprinting
   */
  _averageFeatures(samples) {
    const featureCount = samples[0].length;
    const averaged = new Float32Array(featureCount);

    for (let i = 0; i < featureCount; i++) {
      let sum = 0;
      for (const sample of samples) {
        sum += sample[i];
      }
      averaged[i] = sum / samples.length;
    }

    return averaged;
  }

  /**
   * Verify device against fingerprint
   */
  verifyFingerprint(peerId, audioFeatures) {
    const fingerprint = this.deviceFingerprints.get(peerId);

    if (!fingerprint || !fingerprint.features) {
      return { verified: false, reason: 'No fingerprint on record' };
    }

    // Calculate similarity (cosine similarity)
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < fingerprint.features.length; i++) {
      dotProduct += fingerprint.features[i] * audioFeatures[i];
      normA += fingerprint.features[i] * fingerprint.features[i];
      normB += audioFeatures[i] * audioFeatures[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    const threshold = 0.85;

    if (similarity < threshold) {
      this.stats.spoofingAttempts++;
      this._updateTrust(peerId, -20);
      return {
        verified: false,
        reason: 'Fingerprint mismatch - possible spoofing',
        similarity: similarity
      };
    }

    return { verified: true, similarity: similarity };
  }

  /**
   * Detect jamming based on noise level
   */
  detectJamming(currentNoiseLevel) {
    if (this.noiseBaseline === null) {
      this.noiseBaseline = currentNoiseLevel;
      return { jamming: false };
    }

    // Update baseline slowly
    this.noiseBaseline = this.noiseBaseline * 0.99 + currentNoiseLevel * 0.01;

    const deviation = currentNoiseLevel - this.noiseBaseline;

    if (deviation > this.jammingThreshold) {
      this.stats.jammingDetected++;
      return {
        jamming: true,
        severity: deviation - this.jammingThreshold,
        recommendation: 'Switch frequency band or wait'
      };
    }

    return { jamming: false, noiseLevel: currentNoiseLevel };
  }

  /**
   * Update trust level for peer
   */
  _updateTrust(peerId, delta) {
    const current = this.trustLevels.get(peerId) || 50;
    const newLevel = Math.max(0, Math.min(100, current + delta));
    this.trustLevels.set(peerId, newLevel);
  }

  /**
   * Get trust level for peer
   */
  getTrust(peerId) {
    return this.trustLevels.get(peerId) || 50;
  }

  /**
   * Check if peer is trusted
   */
  isTrusted(peerId, minTrust = 30) {
    return this.getTrust(peerId) >= minTrust;
  }

  /**
   * Start periodic key rotation
   */
  _startKeyRotation() {
    setInterval(() => {
      const now = Date.now();
      for (const [peerId, session] of this.sessionKeys) {
        if (now > session.expires) {
          this.sessionKeys.delete(peerId);
        }
      }
    }, this.keyRotationInterval / 2);
  }

  /**
   * Get security status
   */
  getStatus() {
    return {
      initialized: this.keyPair !== null,
      activeSessions: this.sessionKeys.size,
      pendingChallenges: this.pendingChallenges.size,
      knownFingerprints: this.deviceFingerprints.size,
      stats: this.stats
    };
  }

  /**
   * Get session info for peer
   */
  getSessionInfo(peerId) {
    const session = this.sessionKeys.get(peerId);
    if (!session) return null;

    return {
      established: session.established,
      expires: session.expires,
      remainingTime: session.expires - Date.now(),
      trustLevel: this.getTrust(peerId)
    };
  }

  /**
   * Clear all security state (logout)
   */
  clear() {
    this.sessionKeys.clear();
    this.pendingChallenges.clear();
    this.trustLevels.clear();
  }

  /**
   * Clean up
   */
  dispose() {
    this.clear();
    this.deviceFingerprints.clear();
  }
}

export default SecurityLayer;
