/**
 * AcousticTalk SDK - Device Discovery
 * Zero-config device discovery via acoustic beacons
 */

import { ACOUSTIC_CONFIG, MESSAGE_TYPES, DEVICE_STATES } from './constants.js';

export class DeviceDiscovery {
  constructor(options = {}) {
    this.deviceId = options.deviceId || this._generateUUID();
    this.deviceName = options.deviceName || `Device_${this.deviceId.slice(0, 8)}`;
    this.deviceType = options.deviceType || 'generic';
    this.capabilities = options.capabilities || ['text', 'data'];

    this.beaconInterval = options.beaconInterval || ACOUSTIC_CONFIG.BEACON_INTERVAL;
    this.deviceTimeout = options.deviceTimeout || ACOUSTIC_CONFIG.DEVICE_TIMEOUT;

    // Known devices
    this.devices = new Map();

    // State
    this.isDiscovering = false;
    this.beaconTimer = null;

    // Callbacks
    this.onDeviceDiscovered = null;
    this.onDeviceLost = null;
    this.onDeviceUpdated = null;

    // My beacon info
    this.myBeacon = this._createBeacon();

    // Statistics
    this.stats = {
      beaconsSent: 0,
      beaconsReceived: 0,
      devicesDiscovered: 0,
      devicesLost: 0
    };
  }

  /**
   * Generate UUID v4
   */
  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Create beacon packet
   */
  _createBeacon() {
    return {
      type: MESSAGE_TYPES.BEACON,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: this.deviceType,
      capabilities: this.capabilities,
      timestamp: Date.now(),
      sequence: 0
    };
  }

  /**
   * Start device discovery (send beacons, listen for others)
   */
  startDiscovery() {
    this.isDiscovering = true;

    // Start beacon timer
    this.beaconTimer = setInterval(() => {
      this._sendBeacon();
    }, this.beaconInterval);

    // Send initial beacon
    this._sendBeacon();

    // Start cleanup timer for stale devices
    this.cleanupTimer = setInterval(() => {
      this._cleanupStaleDevices();
    }, this.deviceTimeout / 2);

    return true;
  }

  /**
   * Stop discovery
   */
  stopDiscovery() {
    this.isDiscovering = false;

    if (this.beaconTimer) {
      clearInterval(this.beaconTimer);
      this.beaconTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Send beacon (returns data to be transmitted)
   */
  _sendBeacon() {
    this.myBeacon.timestamp = Date.now();
    this.myBeacon.sequence++;
    this.stats.beaconsSent++;

    return this.myBeacon;
  }

  /**
   * Get beacon data for transmission
   */
  getBeaconData() {
    this.myBeacon.timestamp = Date.now();
    this.myBeacon.sequence++;
    return this._serializeBeacon(this.myBeacon);
  }

  /**
   * Serialize beacon to bytes
   */
  _serializeBeacon(beacon) {
    const json = JSON.stringify(beacon);
    const encoder = new TextEncoder();
    return encoder.encode(json);
  }

  /**
   * Deserialize beacon from bytes
   */
  _deserializeBeacon(data) {
    try {
      const decoder = new TextDecoder();
      const json = decoder.decode(data);
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  /**
   * Process received beacon
   */
  processBeacon(data) {
    const beacon = typeof data === 'object' ? data : this._deserializeBeacon(data);

    if (!beacon || !beacon.deviceId) {
      return null;
    }

    // Ignore our own beacon
    if (beacon.deviceId === this.deviceId) {
      return null;
    }

    this.stats.beaconsReceived++;

    const isNew = !this.devices.has(beacon.deviceId);
    const existingDevice = this.devices.get(beacon.deviceId);

    // Create or update device record
    const device = {
      deviceId: beacon.deviceId,
      deviceName: beacon.deviceName || `Unknown_${beacon.deviceId.slice(0, 8)}`,
      deviceType: beacon.deviceType || 'unknown',
      capabilities: beacon.capabilities || [],
      firstSeen: existingDevice?.firstSeen || Date.now(),
      lastSeen: Date.now(),
      beaconsReceived: (existingDevice?.beaconsReceived || 0) + 1,
      state: DEVICE_STATES.DISCOVERED,
      signalStrength: beacon.signalStrength || 0,
      latency: Date.now() - beacon.timestamp
    };

    this.devices.set(beacon.deviceId, device);

    // Trigger callbacks
    if (isNew) {
      this.stats.devicesDiscovered++;
      if (this.onDeviceDiscovered) {
        this.onDeviceDiscovered(device);
      }
    } else if (this.onDeviceUpdated) {
      this.onDeviceUpdated(device);
    }

    return device;
  }

  /**
   * Clean up devices that haven't been heard from
   */
  _cleanupStaleDevices() {
    const now = Date.now();
    const staleDevices = [];

    for (const [deviceId, device] of this.devices) {
      if (now - device.lastSeen > this.deviceTimeout) {
        staleDevices.push(deviceId);
      }
    }

    for (const deviceId of staleDevices) {
      const device = this.devices.get(deviceId);
      this.devices.delete(deviceId);
      this.stats.devicesLost++;

      if (this.onDeviceLost) {
        this.onDeviceLost(device);
      }
    }
  }

  /**
   * Get all discovered devices
   */
  getDevices() {
    return Array.from(this.devices.values());
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  /**
   * Get devices with specific capability
   */
  getDevicesWithCapability(capability) {
    return this.getDevices().filter(d =>
      d.capabilities.includes(capability)
    );
  }

  /**
   * Get device count
   */
  getDeviceCount() {
    return this.devices.size;
  }

  /**
   * Update my device info
   */
  updateMyInfo(info) {
    if (info.deviceName) this.deviceName = info.deviceName;
    if (info.deviceType) this.deviceType = info.deviceType;
    if (info.capabilities) this.capabilities = info.capabilities;
    this.myBeacon = this._createBeacon();
  }

  /**
   * Get my device info
   */
  getMyInfo() {
    return {
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: this.deviceType,
      capabilities: this.capabilities
    };
  }

  /**
   * Get discovery statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeDevices: this.devices.size,
      isDiscovering: this.isDiscovering
    };
  }

  /**
   * Create a discovery response packet
   */
  createDiscoveryResponse(requesterId) {
    return {
      type: MESSAGE_TYPES.DISCOVERY,
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      deviceType: this.deviceType,
      capabilities: this.capabilities,
      respondingTo: requesterId,
      timestamp: Date.now()
    };
  }

  /**
   * Clean up
   */
  dispose() {
    this.stopDiscovery();
    this.devices.clear();
  }
}

export default DeviceDiscovery;
