/**
 * AcousticTalk SDK - Data Encoding Layer
 * Error correction, framing, and data serialization
 */

import { ACOUSTIC_CONFIG, MESSAGE_TYPES, STREAM_TYPES } from '../core/constants.js';

export class EncodingLayer {
  constructor(options = {}) {
    this.maxPayloadSize = options.maxPayloadSize || ACOUSTIC_CONFIG.MAX_PAYLOAD_SIZE;
    this.interleaveDepth = options.interleaveDepth || ACOUSTIC_CONFIG.INTERLEAVE_DEPTH;

    // CRC-32 lookup table
    this.crcTable = this._generateCRCTable();

    // Statistics
    this.stats = {
      bytesEncoded: 0,
      bytesDecoded: 0,
      framesCreated: 0,
      framesDecoded: 0,
      crcErrors: 0,
      correctedErrors: 0
    };
  }

  /**
   * Generate CRC-32 lookup table
   */
  _generateCRCTable() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
      table[i] = crc;
    }
    return table;
  }

  /**
   * Calculate CRC-32 checksum
   */
  calculateCRC(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = this.crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * Create a frame from payload data
   * Frame structure:
   * [2 bytes: magic] [1 byte: type] [1 byte: flags] [2 bytes: seq] [2 bytes: length] [N bytes: payload] [4 bytes: CRC]
   */
  createFrame(payload, options = {}) {
    const type = options.type || MESSAGE_TYPES.DATA;
    const sequence = options.sequence || 0;
    const flags = options.flags || 0;

    const payloadBytes = payload instanceof Uint8Array
      ? payload
      : new TextEncoder().encode(payload);

    // Create header
    const headerSize = 8;
    const frameSize = headerSize + payloadBytes.length + 4;
    const frame = new Uint8Array(frameSize);

    // Magic bytes
    frame[0] = 0xAC;  // 'AC' for AcousticTalk
    frame[1] = 0x4D;  // 'M' for Mesh

    // Type and flags
    frame[2] = type;
    frame[3] = flags;

    // Sequence number (16-bit)
    frame[4] = (sequence >> 8) & 0xFF;
    frame[5] = sequence & 0xFF;

    // Payload length (16-bit)
    frame[6] = (payloadBytes.length >> 8) & 0xFF;
    frame[7] = payloadBytes.length & 0xFF;

    // Payload
    frame.set(payloadBytes, headerSize);

    // CRC-32
    const crc = this.calculateCRC(frame.slice(0, headerSize + payloadBytes.length));
    frame[headerSize + payloadBytes.length] = (crc >> 24) & 0xFF;
    frame[headerSize + payloadBytes.length + 1] = (crc >> 16) & 0xFF;
    frame[headerSize + payloadBytes.length + 2] = (crc >> 8) & 0xFF;
    frame[headerSize + payloadBytes.length + 3] = crc & 0xFF;

    this.stats.bytesEncoded += frameSize;
    this.stats.framesCreated++;

    return frame;
  }

  /**
   * Parse a frame
   */
  parseFrame(frame) {
    if (frame.length < 12) {
      return { valid: false, error: 'Frame too short' };
    }

    // Check magic bytes
    if (frame[0] !== 0xAC || frame[1] !== 0x4D) {
      return { valid: false, error: 'Invalid magic bytes' };
    }

    const type = frame[2];
    const flags = frame[3];
    const sequence = (frame[4] << 8) | frame[5];
    const payloadLength = (frame[6] << 8) | frame[7];

    // Validate length
    const expectedLength = 8 + payloadLength + 4;
    if (frame.length < expectedLength) {
      return { valid: false, error: 'Frame truncated' };
    }

    // Extract payload
    const payload = frame.slice(8, 8 + payloadLength);

    // Verify CRC
    const receivedCRC =
      (frame[8 + payloadLength] << 24) |
      (frame[8 + payloadLength + 1] << 16) |
      (frame[8 + payloadLength + 2] << 8) |
      frame[8 + payloadLength + 3];

    const calculatedCRC = this.calculateCRC(frame.slice(0, 8 + payloadLength));

    if (receivedCRC !== calculatedCRC) {
      this.stats.crcErrors++;
      return { valid: false, error: 'CRC mismatch', correctable: true };
    }

    this.stats.bytesDecoded += frame.length;
    this.stats.framesDecoded++;

    return {
      valid: true,
      type: type,
      flags: flags,
      sequence: sequence,
      payload: payload,
      payloadLength: payloadLength
    };
  }

  /**
   * Apply forward error correction (convolutional-like encoding)
   * Simple repetition + interleaving for robustness
   */
  applyFEC(data) {
    // Repeat each byte 3x for redundancy
    const expanded = new Uint8Array(data.length * 3);
    for (let i = 0; i < data.length; i++) {
      expanded[i * 3] = data[i];
      expanded[i * 3 + 1] = data[i];
      expanded[i * 3 + 2] = data[i];
    }

    // Interleave
    return this._interleave(expanded);
  }

  /**
   * Decode FEC data
   */
  decodeFEC(data) {
    // De-interleave
    const deinterleaved = this._deinterleave(data);

    // Majority voting for each byte
    const decoded = new Uint8Array(deinterleaved.length / 3);
    for (let i = 0; i < decoded.length; i++) {
      const b1 = deinterleaved[i * 3];
      const b2 = deinterleaved[i * 3 + 1];
      const b3 = deinterleaved[i * 3 + 2];

      // Bit-by-bit majority voting
      let result = 0;
      for (let bit = 0; bit < 8; bit++) {
        const mask = 1 << bit;
        const votes = ((b1 & mask) ? 1 : 0) + ((b2 & mask) ? 1 : 0) + ((b3 & mask) ? 1 : 0);
        if (votes >= 2) {
          result |= mask;
          if (votes < 3) this.stats.correctedErrors++;
        }
      }
      decoded[i] = result;
    }

    return decoded;
  }

  /**
   * Interleave data to spread burst errors
   */
  _interleave(data) {
    const depth = this.interleaveDepth;
    const numRows = Math.ceil(data.length / depth);
    const interleaved = new Uint8Array(numRows * depth);

    // Fill row by row, read column by column
    for (let i = 0; i < data.length; i++) {
      const row = Math.floor(i / depth);
      const col = i % depth;
      const newIndex = col * numRows + row;
      interleaved[newIndex] = data[i];
    }

    return interleaved;
  }

  /**
   * De-interleave data
   */
  _deinterleave(data) {
    const depth = this.interleaveDepth;
    const numRows = Math.ceil(data.length / depth);
    const deinterleaved = new Uint8Array(data.length);

    for (let i = 0; i < data.length; i++) {
      const col = Math.floor(i / numRows);
      const row = i % numRows;
      const originalIndex = row * depth + col;
      if (originalIndex < data.length) {
        deinterleaved[originalIndex] = data[i];
      }
    }

    return deinterleaved;
  }

  /**
   * Split large data into frames
   */
  fragmentData(data, options = {}) {
    const type = options.type || MESSAGE_TYPES.DATA;
    const maxSize = this.maxPayloadSize;

    const bytes = data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(data);

    const fragments = [];
    const totalFragments = Math.ceil(bytes.length / maxSize);

    for (let i = 0; i < totalFragments; i++) {
      const start = i * maxSize;
      const end = Math.min(start + maxSize, bytes.length);
      const fragmentData = bytes.slice(start, end);

      // Flags: [bit 7: more fragments] [bit 6: first fragment] [bits 0-5: reserved]
      let flags = 0;
      if (i < totalFragments - 1) flags |= 0x80;  // More fragments
      if (i === 0) flags |= 0x40;                  // First fragment

      const frame = this.createFrame(fragmentData, {
        type: type,
        sequence: i,
        flags: flags
      });

      fragments.push(frame);
    }

    return fragments;
  }

  /**
   * Reassemble fragments into original data
   */
  reassembleData(fragments) {
    // Sort by sequence number
    const sorted = [...fragments].sort((a, b) => a.sequence - b.sequence);

    // Check for completeness
    const firstFragment = sorted.find(f => f.flags & 0x40);
    const lastFragment = sorted.find(f => !(f.flags & 0x80));

    if (!firstFragment || !lastFragment) {
      return { complete: false, error: 'Missing fragments' };
    }

    // Concatenate payloads
    const totalSize = sorted.reduce((sum, f) => sum + f.payload.length, 0);
    const assembled = new Uint8Array(totalSize);

    let offset = 0;
    for (const fragment of sorted) {
      assembled.set(fragment.payload, offset);
      offset += fragment.payload.length;
    }

    return {
      complete: true,
      data: assembled,
      fragmentCount: sorted.length
    };
  }

  /**
   * Encode data for specific stream type
   */
  encodeStream(data, streamType) {
    let encoded;

    switch (streamType) {
      case STREAM_TYPES.TEXT:
        encoded = new TextEncoder().encode(data);
        break;

      case STREAM_TYPES.JSON:
        encoded = new TextEncoder().encode(JSON.stringify(data));
        break;

      case STREAM_TYPES.IMAGE:
        // Base64 decode if string, otherwise use as-is
        if (typeof data === 'string') {
          const binary = atob(data.split(',')[1] || data);
          encoded = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            encoded[i] = binary.charCodeAt(i);
          }
        } else {
          encoded = new Uint8Array(data);
        }
        break;

      case STREAM_TYPES.BINARY:
      default:
        encoded = data instanceof Uint8Array ? data : new Uint8Array(data);
        break;
    }

    return encoded;
  }

  /**
   * Decode data for specific stream type
   */
  decodeStream(data, streamType) {
    switch (streamType) {
      case STREAM_TYPES.TEXT:
        return new TextDecoder().decode(data);

      case STREAM_TYPES.JSON:
        return JSON.parse(new TextDecoder().decode(data));

      case STREAM_TYPES.IMAGE:
        // Return as base64 data URL
        const base64 = btoa(String.fromCharCode(...data));
        return `data:image/png;base64,${base64}`;

      case STREAM_TYPES.BINARY:
      default:
        return data;
    }
  }

  /**
   * Get encoding statistics
   */
  getStats() {
    return {
      ...this.stats,
      compressionRatio: this.stats.bytesEncoded > 0
        ? this.stats.bytesDecoded / this.stats.bytesEncoded
        : 1,
      errorRate: this.stats.framesDecoded > 0
        ? this.stats.crcErrors / this.stats.framesDecoded
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      bytesEncoded: 0,
      bytesDecoded: 0,
      framesCreated: 0,
      framesDecoded: 0,
      crcErrors: 0,
      correctedErrors: 0
    };
  }
}

export default EncodingLayer;
