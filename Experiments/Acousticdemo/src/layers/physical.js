/**
 * AcousticTalk SDK - Physical Layer
 * FSK Modulation/Demodulation for acoustic data transmission
 */

import { ACOUSTIC_CONFIG, MODULATION_MODES } from '../core/constants.js';

export class PhysicalLayer {
  constructor(options = {}) {
    this.mode = options.mode || 'ultrasonic';
    this.config = this.mode === 'ultrasonic'
      ? ACOUSTIC_CONFIG.ULTRASONIC
      : ACOUSTIC_CONFIG.AUDIBLE;

    this.sampleRate = options.sampleRate || ACOUSTIC_CONFIG.SAMPLE_RATE;
    this.symbolDuration = options.symbolDuration || ACOUSTIC_CONFIG.SYMBOL_DURATION;
    this.guardInterval = options.guardInterval || ACOUSTIC_CONFIG.GUARD_INTERVAL;

    // Precompute frequency table
    this.frequencies = this._generateFrequencyTable();

    // Goertzel filter coefficients for efficient frequency detection
    this.goertzelCoeffs = this._precomputeGoertzelCoeffs();

    // Statistics
    this.stats = {
      symbolsTransmitted: 0,
      symbolsReceived: 0,
      errors: 0,
      avgSNR: 0
    };
  }

  /**
   * Generate frequency lookup table for FSK symbols
   */
  _generateFrequencyTable() {
    const frequencies = [];
    for (let i = 0; i < this.config.NUM_FREQUENCIES; i++) {
      frequencies.push(this.config.BASE_FREQ + (i * this.config.FREQ_SPACING));
    }
    return frequencies;
  }

  /**
   * Precompute Goertzel algorithm coefficients for frequency detection
   */
  _precomputeGoertzelCoeffs() {
    const N = Math.floor(this.sampleRate * this.symbolDuration);
    return this.frequencies.map(freq => {
      const k = Math.round(freq * N / this.sampleRate);
      const w = (2 * Math.PI * k) / N;
      return {
        coeff: 2 * Math.cos(w),
        freq: freq,
        k: k,
        N: N
      };
    });
  }

  /**
   * Modulate data bytes into audio samples (FSK)
   * @param {Uint8Array} data - Data to transmit
   * @returns {Float32Array} - Audio samples
   */
  modulate(data) {
    const symbols = this._bytesToSymbols(data);
    const samplesPerSymbol = Math.floor(this.sampleRate * this.symbolDuration);
    const guardSamples = Math.floor(this.sampleRate * this.guardInterval);
    const totalSamples = symbols.length * (samplesPerSymbol + guardSamples);

    // Add preamble
    const preambleSamples = Math.floor(this.sampleRate * ACOUSTIC_CONFIG.PREAMBLE_DURATION);
    const output = new Float32Array(preambleSamples + totalSamples);

    // Generate preamble (chirp for synchronization)
    this._generatePreamble(output, 0, preambleSamples);

    // Generate FSK symbols
    let offset = preambleSamples;
    for (let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i];
      const freq = this.frequencies[symbol];

      // Generate tone for this symbol
      for (let j = 0; j < samplesPerSymbol; j++) {
        const t = j / this.sampleRate;
        // Apply Hanning window for smooth transitions
        const window = 0.5 * (1 - Math.cos(2 * Math.PI * j / samplesPerSymbol));
        output[offset + j] = window * Math.sin(2 * Math.PI * freq * t);
      }

      // Guard interval (silence)
      offset += samplesPerSymbol + guardSamples;
      this.stats.symbolsTransmitted++;
    }

    return output;
  }

  /**
   * Generate synchronization preamble (linear chirp)
   */
  _generatePreamble(output, startOffset, numSamples) {
    const startFreq = this.config.BASE_FREQ - 500;
    const endFreq = this.config.BASE_FREQ + this.config.BANDWIDTH + 500;

    for (let i = 0; i < numSamples; i++) {
      const t = i / this.sampleRate;
      const progress = i / numSamples;
      const freq = startFreq + (endFreq - startFreq) * progress;
      const phase = 2 * Math.PI * freq * t;
      output[startOffset + i] = 0.8 * Math.sin(phase);
    }
  }

  /**
   * Demodulate audio samples back to data bytes
   * @param {Float32Array} samples - Audio samples
   * @returns {Object} - { data: Uint8Array, confidence: number, stats: Object }
   */
  demodulate(samples) {
    // Find preamble and synchronize
    const syncResult = this._findPreamble(samples);
    if (!syncResult.found) {
      return { data: null, confidence: 0, error: 'No preamble found' };
    }

    const startOffset = syncResult.offset;
    const samplesPerSymbol = Math.floor(this.sampleRate * this.symbolDuration);
    const guardSamples = Math.floor(this.sampleRate * this.guardInterval);
    const totalSymbolSamples = samplesPerSymbol + guardSamples;

    // Calculate number of symbols in remaining samples
    const remainingSamples = samples.length - startOffset;
    const numSymbols = Math.floor(remainingSamples / totalSymbolSamples);

    const symbols = [];
    const confidences = [];

    for (let i = 0; i < numSymbols; i++) {
      const symbolStart = startOffset + (i * totalSymbolSamples);
      const symbolSamples = samples.slice(symbolStart, symbolStart + samplesPerSymbol);

      const result = this._detectSymbol(symbolSamples);
      symbols.push(result.symbol);
      confidences.push(result.confidence);
      this.stats.symbolsReceived++;
    }

    // Convert symbols back to bytes
    const data = this._symbolsToBytes(symbols);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return {
      data: data,
      confidence: avgConfidence,
      stats: {
        symbolsDecoded: symbols.length,
        avgConfidence: avgConfidence,
        syncOffset: startOffset
      }
    };
  }

  /**
   * Find preamble using correlation
   */
  _findPreamble(samples) {
    const preambleSamples = Math.floor(this.sampleRate * ACOUSTIC_CONFIG.PREAMBLE_DURATION);
    const searchWindow = Math.min(samples.length - preambleSamples, this.sampleRate * 2);

    // Generate reference preamble
    const reference = new Float32Array(preambleSamples);
    this._generatePreamble(reference, 0, preambleSamples);

    let maxCorrelation = 0;
    let bestOffset = 0;

    // Sliding window correlation
    const step = Math.floor(this.sampleRate * 0.001); // 1ms steps
    for (let offset = 0; offset < searchWindow; offset += step) {
      let correlation = 0;
      let sumRef = 0;
      let sumSig = 0;

      for (let i = 0; i < preambleSamples; i += 4) { // Subsample for speed
        correlation += reference[i] * samples[offset + i];
        sumRef += reference[i] * reference[i];
        sumSig += samples[offset + i] * samples[offset + i];
      }

      // Normalized correlation
      const norm = Math.sqrt(sumRef * sumSig);
      if (norm > 0) {
        correlation /= norm;
      }

      if (correlation > maxCorrelation) {
        maxCorrelation = correlation;
        bestOffset = offset;
      }
    }

    const threshold = 0.3;
    return {
      found: maxCorrelation > threshold,
      offset: bestOffset + preambleSamples,
      correlation: maxCorrelation
    };
  }

  /**
   * Detect which FSK symbol is present using Goertzel algorithm
   */
  _detectSymbol(samples) {
    const powers = [];

    for (const coeff of this.goertzelCoeffs) {
      const power = this._goertzel(samples, coeff);
      powers.push(power);
    }

    // Find frequency with maximum power
    let maxPower = 0;
    let maxIndex = 0;
    for (let i = 0; i < powers.length; i++) {
      if (powers[i] > maxPower) {
        maxPower = powers[i];
        maxIndex = i;
      }
    }

    // Calculate confidence (ratio of max to second max)
    const sortedPowers = [...powers].sort((a, b) => b - a);
    const confidence = sortedPowers[1] > 0
      ? (sortedPowers[0] - sortedPowers[1]) / sortedPowers[0]
      : 1;

    return { symbol: maxIndex, confidence: confidence, power: maxPower };
  }

  /**
   * Goertzel algorithm for efficient single-frequency detection
   */
  _goertzel(samples, coeff) {
    let s0 = 0, s1 = 0, s2 = 0;

    for (let i = 0; i < samples.length; i++) {
      s0 = samples[i] + coeff.coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }

    // Power at the target frequency
    const power = s1 * s1 + s2 * s2 - coeff.coeff * s1 * s2;
    return power;
  }

  /**
   * Convert bytes to FSK symbols (4 bits per symbol for 16-FSK)
   */
  _bytesToSymbols(data) {
    const bitsPerSymbol = Math.log2(this.config.NUM_FREQUENCIES);
    const symbols = [];

    if (bitsPerSymbol === 4) {
      // 16-FSK: 2 symbols per byte
      for (const byte of data) {
        symbols.push((byte >> 4) & 0x0F);  // High nibble
        symbols.push(byte & 0x0F);          // Low nibble
      }
    } else if (bitsPerSymbol === 3) {
      // 8-FSK: pack bits more carefully
      let bitBuffer = 0;
      let bitsInBuffer = 0;

      for (const byte of data) {
        bitBuffer = (bitBuffer << 8) | byte;
        bitsInBuffer += 8;

        while (bitsInBuffer >= 3) {
          bitsInBuffer -= 3;
          symbols.push((bitBuffer >> bitsInBuffer) & 0x07);
        }
      }

      // Pad remaining bits
      if (bitsInBuffer > 0) {
        symbols.push((bitBuffer << (3 - bitsInBuffer)) & 0x07);
      }
    }

    return symbols;
  }

  /**
   * Convert FSK symbols back to bytes
   */
  _symbolsToBytes(symbols) {
    const bitsPerSymbol = Math.log2(this.config.NUM_FREQUENCIES);
    const bytes = [];

    if (bitsPerSymbol === 4) {
      // 16-FSK: 2 symbols per byte
      for (let i = 0; i < symbols.length - 1; i += 2) {
        const byte = ((symbols[i] & 0x0F) << 4) | (symbols[i + 1] & 0x0F);
        bytes.push(byte);
      }
    } else if (bitsPerSymbol === 3) {
      // 8-FSK: unpack bits
      let bitBuffer = 0;
      let bitsInBuffer = 0;

      for (const symbol of symbols) {
        bitBuffer = (bitBuffer << 3) | (symbol & 0x07);
        bitsInBuffer += 3;

        while (bitsInBuffer >= 8) {
          bitsInBuffer -= 8;
          bytes.push((bitBuffer >> bitsInBuffer) & 0xFF);
        }
      }
    }

    return new Uint8Array(bytes);
  }

  /**
   * Calculate theoretical data rate
   */
  getDataRate() {
    const symbolsPerSecond = 1 / (this.symbolDuration + this.guardInterval);
    const bitsPerSymbol = Math.log2(this.config.NUM_FREQUENCIES);
    const bitsPerSecond = symbolsPerSecond * bitsPerSymbol;
    return {
      symbolRate: symbolsPerSecond,
      bitRate: bitsPerSecond,
      byteRate: bitsPerSecond / 8,
      effectiveRate: (bitsPerSecond / 8) * ACOUSTIC_CONFIG.FEC_RATE // After FEC overhead
    };
  }

  /**
   * Get current statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      symbolsTransmitted: 0,
      symbolsReceived: 0,
      errors: 0,
      avgSNR: 0
    };
  }
}

export default PhysicalLayer;
