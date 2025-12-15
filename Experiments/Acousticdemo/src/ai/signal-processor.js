/**
 * AcousticTalk SDK - AI Signal Processor
 * Noise filtering, echo cancellation, Doppler compensation
 */

import { ACOUSTIC_CONFIG } from '../core/constants.js';

export class SignalProcessor {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || ACOUSTIC_CONFIG.SAMPLE_RATE;
    this.fftSize = options.fftSize || ACOUSTIC_CONFIG.FFT_SIZE;

    // Noise profile
    this.noiseFloor = new Float32Array(this.fftSize / 2);
    this.noiseFloorAdaptRate = 0.01;

    // Echo cancellation
    this.echoBuffer = new Float32Array(this.sampleRate); // 1 second
    this.echoBufferIndex = 0;
    this.echoTaps = options.echoTaps || 128;
    this.echoCoeffs = new Float32Array(this.echoTaps);

    // Doppler tracking
    this.frequencyHistory = [];
    this.dopplerShift = 0;

    // Adaptive filter (LMS)
    this.lmsStepSize = 0.01;

    // Band-pass filter coefficients
    this.bandpassCoeffs = this._designBandpassFilter();

    // AGC (Automatic Gain Control)
    this.targetLevel = 0.3;
    this.currentGain = 1.0;
    this.agcAttack = 0.1;
    this.agcRelease = 0.01;

    // Statistics
    this.stats = {
      samplesProcessed: 0,
      noiseRemoved: 0,
      echoRemoved: 0,
      dopplerCompensations: 0
    };
  }

  /**
   * Process audio samples through full pipeline
   */
  process(samples) {
    let processed = samples;

    // Apply band-pass filter
    processed = this.bandpassFilter(processed);

    // Noise reduction
    processed = this.reduceNoise(processed);

    // Echo cancellation
    processed = this.cancelEcho(processed);

    // AGC
    processed = this.applyAGC(processed);

    this.stats.samplesProcessed += samples.length;

    return processed;
  }

  /**
   * Design band-pass filter for acoustic communication frequencies
   */
  _designBandpassFilter() {
    const lowCut = ACOUSTIC_CONFIG.ULTRASONIC.BASE_FREQ - 500;
    const highCut = ACOUSTIC_CONFIG.ULTRASONIC.BASE_FREQ + ACOUSTIC_CONFIG.ULTRASONIC.BANDWIDTH + 500;

    // Normalized frequencies
    const nyquist = this.sampleRate / 2;
    const lowNorm = lowCut / nyquist;
    const highNorm = highCut / nyquist;

    // Simple FIR bandpass coefficients (Hamming window)
    const numTaps = 65;
    const coeffs = new Float32Array(numTaps);
    const mid = (numTaps - 1) / 2;

    for (let i = 0; i < numTaps; i++) {
      const n = i - mid;
      if (n === 0) {
        coeffs[i] = 2 * (highNorm - lowNorm);
      } else {
        coeffs[i] = (Math.sin(2 * Math.PI * highNorm * n) - Math.sin(2 * Math.PI * lowNorm * n)) / (Math.PI * n);
      }
      // Hamming window
      coeffs[i] *= 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (numTaps - 1));
    }

    return coeffs;
  }

  /**
   * Apply band-pass filter
   */
  bandpassFilter(samples) {
    const output = new Float32Array(samples.length);
    const taps = this.bandpassCoeffs.length;

    for (let i = 0; i < samples.length; i++) {
      let sum = 0;
      for (let j = 0; j < taps; j++) {
        const idx = i - j;
        if (idx >= 0) {
          sum += samples[idx] * this.bandpassCoeffs[j];
        }
      }
      output[i] = sum;
    }

    return output;
  }

  /**
   * Spectral noise reduction
   */
  reduceNoise(samples) {
    // Compute FFT
    const fft = this._fft(samples);

    // Update noise floor estimate
    for (let i = 0; i < fft.magnitude.length; i++) {
      // Track minimum (noise floor)
      if (fft.magnitude[i] < this.noiseFloor[i] || this.noiseFloor[i] === 0) {
        this.noiseFloor[i] = fft.magnitude[i];
      } else {
        this.noiseFloor[i] = this.noiseFloor[i] * (1 - this.noiseFloorAdaptRate) +
          fft.magnitude[i] * this.noiseFloorAdaptRate * 0.5;
      }
    }

    // Spectral subtraction
    const cleanMagnitude = new Float32Array(fft.magnitude.length);
    for (let i = 0; i < fft.magnitude.length; i++) {
      const noiseEstimate = this.noiseFloor[i] * 2; // Safety margin
      cleanMagnitude[i] = Math.max(0, fft.magnitude[i] - noiseEstimate);

      if (fft.magnitude[i] > noiseEstimate) {
        this.stats.noiseRemoved++;
      }
    }

    // Inverse FFT
    return this._ifft(cleanMagnitude, fft.phase);
  }

  /**
   * Adaptive echo cancellation (LMS algorithm)
   */
  cancelEcho(samples) {
    const output = new Float32Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      // Predict echo
      let echoPrediction = 0;
      for (let j = 0; j < this.echoTaps; j++) {
        const idx = (this.echoBufferIndex - j + this.echoBuffer.length) % this.echoBuffer.length;
        echoPrediction += this.echoCoeffs[j] * this.echoBuffer[idx];
      }

      // Subtract predicted echo
      const error = samples[i] - echoPrediction;
      output[i] = error;

      // Update filter coefficients (LMS)
      for (let j = 0; j < this.echoTaps; j++) {
        const idx = (this.echoBufferIndex - j + this.echoBuffer.length) % this.echoBuffer.length;
        this.echoCoeffs[j] += this.lmsStepSize * error * this.echoBuffer[idx];
      }

      // Store sample in echo buffer
      this.echoBuffer[this.echoBufferIndex] = samples[i];
      this.echoBufferIndex = (this.echoBufferIndex + 1) % this.echoBuffer.length;

      if (Math.abs(echoPrediction) > 0.01) {
        this.stats.echoRemoved++;
      }
    }

    return output;
  }

  /**
   * Track and compensate for Doppler shift
   */
  compensateDoppler(samples, expectedFrequency) {
    // Detect actual frequency
    const detected = this.detectPeakFrequency(samples);

    // Calculate shift
    const shift = detected - expectedFrequency;

    // Track shift history
    this.frequencyHistory.push(shift);
    if (this.frequencyHistory.length > 10) {
      this.frequencyHistory.shift();
    }

    // Average shift for stability
    this.dopplerShift = this.frequencyHistory.reduce((a, b) => a + b, 0) / this.frequencyHistory.length;

    // Compensate if significant
    if (Math.abs(this.dopplerShift) > 5) {
      this.stats.dopplerCompensations++;
      return this._frequencyShift(samples, -this.dopplerShift);
    }

    return samples;
  }

  /**
   * Detect peak frequency in signal
   */
  detectPeakFrequency(samples) {
    const fft = this._fft(samples);

    let maxMag = 0;
    let maxIdx = 0;

    for (let i = 0; i < fft.magnitude.length; i++) {
      if (fft.magnitude[i] > maxMag) {
        maxMag = fft.magnitude[i];
        maxIdx = i;
      }
    }

    // Quadratic interpolation for sub-bin accuracy
    const y0 = fft.magnitude[Math.max(0, maxIdx - 1)];
    const y1 = fft.magnitude[maxIdx];
    const y2 = fft.magnitude[Math.min(fft.magnitude.length - 1, maxIdx + 1)];

    const delta = (y0 - y2) / (2 * (y0 - 2 * y1 + y2));
    const binWidth = this.sampleRate / this.fftSize;

    return (maxIdx + delta) * binWidth;
  }

  /**
   * Shift signal frequency
   */
  _frequencyShift(samples, shiftHz) {
    const output = new Float32Array(samples.length);
    const phaseIncrement = 2 * Math.PI * shiftHz / this.sampleRate;

    for (let i = 0; i < samples.length; i++) {
      // Complex multiplication for frequency shift
      const phase = phaseIncrement * i;
      output[i] = samples[i] * Math.cos(phase);
    }

    return output;
  }

  /**
   * Automatic Gain Control
   */
  applyAGC(samples) {
    const output = new Float32Array(samples.length);

    // Calculate RMS
    let rms = 0;
    for (let i = 0; i < samples.length; i++) {
      rms += samples[i] * samples[i];
    }
    rms = Math.sqrt(rms / samples.length);

    // Adjust gain
    if (rms > 0) {
      const targetGain = this.targetLevel / rms;

      // Smooth gain changes
      if (targetGain < this.currentGain) {
        this.currentGain = this.currentGain * (1 - this.agcAttack) + targetGain * this.agcAttack;
      } else {
        this.currentGain = this.currentGain * (1 - this.agcRelease) + targetGain * this.agcRelease;
      }

      // Limit gain range
      this.currentGain = Math.max(0.1, Math.min(10, this.currentGain));
    }

    // Apply gain
    for (let i = 0; i < samples.length; i++) {
      output[i] = samples[i] * this.currentGain;
    }

    return output;
  }

  /**
   * Simple FFT implementation
   */
  _fft(samples) {
    const N = this.fftSize;
    const paddedSamples = new Float32Array(N);

    // Zero-pad or truncate
    const copyLen = Math.min(samples.length, N);
    for (let i = 0; i < copyLen; i++) {
      paddedSamples[i] = samples[i];
    }

    // Apply Hanning window
    for (let i = 0; i < N; i++) {
      paddedSamples[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / N));
    }

    // DFT (simplified, use WebAudio AnalyserNode for production)
    const real = new Float32Array(N / 2);
    const imag = new Float32Array(N / 2);
    const magnitude = new Float32Array(N / 2);
    const phase = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
      let sumReal = 0;
      let sumImag = 0;

      for (let n = 0; n < N; n++) {
        const angle = 2 * Math.PI * k * n / N;
        sumReal += paddedSamples[n] * Math.cos(angle);
        sumImag -= paddedSamples[n] * Math.sin(angle);
      }

      real[k] = sumReal;
      imag[k] = sumImag;
      magnitude[k] = Math.sqrt(sumReal * sumReal + sumImag * sumImag);
      phase[k] = Math.atan2(sumImag, sumReal);
    }

    return { real, imag, magnitude, phase };
  }

  /**
   * Inverse FFT
   */
  _ifft(magnitude, phase) {
    const N = magnitude.length * 2;
    const output = new Float32Array(N);

    // Reconstruct real and imaginary
    const real = new Float32Array(N / 2);
    const imag = new Float32Array(N / 2);

    for (let k = 0; k < N / 2; k++) {
      real[k] = magnitude[k] * Math.cos(phase[k]);
      imag[k] = magnitude[k] * Math.sin(phase[k]);
    }

    // IDFT
    for (let n = 0; n < N; n++) {
      let sum = 0;
      for (let k = 0; k < N / 2; k++) {
        const angle = 2 * Math.PI * k * n / N;
        sum += real[k] * Math.cos(angle) - imag[k] * Math.sin(angle);
      }
      output[n] = sum / N;
    }

    return output;
  }

  /**
   * Calculate Signal-to-Noise Ratio
   */
  calculateSNR(signal, noise) {
    let signalPower = 0;
    let noisePower = 0;

    for (let i = 0; i < signal.length; i++) {
      signalPower += signal[i] * signal[i];
    }
    signalPower /= signal.length;

    for (let i = 0; i < noise.length; i++) {
      noisePower += noise[i] * noise[i];
    }
    noisePower /= noise.length;

    if (noisePower === 0) return Infinity;

    return 10 * Math.log10(signalPower / noisePower);
  }

  /**
   * Extract features for acoustic fingerprinting
   */
  extractFeatures(samples) {
    const fft = this._fft(samples);

    // MFCC-like features (simplified)
    const numBands = 13;
    const features = new Float32Array(numBands);
    const binWidth = this.sampleRate / this.fftSize;
    const bandWidth = Math.floor(fft.magnitude.length / numBands);

    for (let i = 0; i < numBands; i++) {
      let sum = 0;
      for (let j = i * bandWidth; j < (i + 1) * bandWidth && j < fft.magnitude.length; j++) {
        sum += fft.magnitude[j];
      }
      features[i] = Math.log(1 + sum / bandWidth);
    }

    return features;
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentGain: this.currentGain,
      dopplerShift: this.dopplerShift
    };
  }

  /**
   * Reset state
   */
  reset() {
    this.noiseFloor.fill(0);
    this.echoCoeffs.fill(0);
    this.frequencyHistory = [];
    this.dopplerShift = 0;
    this.currentGain = 1.0;
  }
}

export default SignalProcessor;
