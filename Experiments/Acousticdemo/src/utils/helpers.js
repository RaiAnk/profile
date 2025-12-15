/**
 * AcousticTalk SDK - Utility Functions
 */

/**
 * Generate UUID v4
 */
export function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration to human readable string
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

/**
 * Calculate checksum (simple XOR)
 */
export function calculateChecksum(data) {
  let checksum = 0;
  for (let i = 0; i < data.length; i++) {
    checksum ^= data[i];
  }
  return checksum;
}

/**
 * Delay utility
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await delay(baseDelay * Math.pow(2, i));
    }
  }
}

/**
 * Throttle function calls
 */
export function throttle(fn, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Debounce function calls
 */
export function debounce(fn, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), wait);
  };
}

/**
 * Convert ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 to ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Uint8Array) return new Uint8Array(obj);
  if (obj instanceof Float32Array) return new Float32Array(obj);

  const cloned = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

/**
 * Event emitter mixin
 */
export class EventEmitter {
  constructor() {
    this._events = {};
  }

  on(event, listener) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    if (!this._events[event]) return;
    this._events[event] = this._events[event].filter(l => l !== listener);
  }

  emit(event, ...args) {
    if (!this._events[event]) return;
    this._events[event].forEach(listener => listener(...args));
  }

  once(event, listener) {
    const unsubscribe = this.on(event, (...args) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }
}

/**
 * Simple logger
 */
export const logger = {
  level: 'info',
  levels: { debug: 0, info: 1, warn: 2, error: 3 },

  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  },

  debug(...args) {
    if (this._shouldLog('debug')) console.debug('[AcousticTalk]', ...args);
  },

  info(...args) {
    if (this._shouldLog('info')) console.info('[AcousticTalk]', ...args);
  },

  warn(...args) {
    if (this._shouldLog('warn')) console.warn('[AcousticTalk]', ...args);
  },

  error(...args) {
    if (this._shouldLog('error')) console.error('[AcousticTalk]', ...args);
  }
};

/**
 * Performance timer
 */
export class Timer {
  constructor(name = 'Timer') {
    this.name = name;
    this.marks = {};
  }

  mark(name) {
    this.marks[name] = performance.now();
  }

  measure(startMark, endMark) {
    const start = this.marks[startMark];
    const end = this.marks[endMark] || performance.now();
    return end - start;
  }

  log(startMark, endMark) {
    const duration = this.measure(startMark, endMark);
    logger.info(`${this.name} [${startMark} -> ${endMark}]: ${duration.toFixed(2)}ms`);
    return duration;
  }
}

/**
 * Ring buffer for audio samples
 */
export class RingBuffer {
  constructor(size) {
    this.buffer = new Float32Array(size);
    this.size = size;
    this.writeIndex = 0;
    this.readIndex = 0;
    this.available = 0;
  }

  write(data) {
    for (let i = 0; i < data.length; i++) {
      this.buffer[this.writeIndex] = data[i];
      this.writeIndex = (this.writeIndex + 1) % this.size;
      if (this.available < this.size) {
        this.available++;
      } else {
        this.readIndex = (this.readIndex + 1) % this.size;
      }
    }
  }

  read(length) {
    const output = new Float32Array(Math.min(length, this.available));
    for (let i = 0; i < output.length; i++) {
      output[i] = this.buffer[this.readIndex];
      this.readIndex = (this.readIndex + 1) % this.size;
      this.available--;
    }
    return output;
  }

  peek(length) {
    const output = new Float32Array(Math.min(length, this.available));
    let idx = this.readIndex;
    for (let i = 0; i < output.length; i++) {
      output[i] = this.buffer[idx];
      idx = (idx + 1) % this.size;
    }
    return output;
  }

  clear() {
    this.writeIndex = 0;
    this.readIndex = 0;
    this.available = 0;
  }

  getAvailable() {
    return this.available;
  }

  isFull() {
    return this.available === this.size;
  }
}
