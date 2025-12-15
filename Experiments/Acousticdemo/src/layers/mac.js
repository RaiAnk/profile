/**
 * AcousticTalk SDK - MAC Layer
 * Time-slotted ALOHA protocol for multi-device coordination
 */

import { ACOUSTIC_CONFIG, MESSAGE_TYPES, DEVICE_STATES } from '../core/constants.js';

export class MACLayer {
  constructor(deviceId, options = {}) {
    this.deviceId = deviceId;
    this.config = {
      slotDuration: options.slotDuration || ACOUSTIC_CONFIG.SLOT_DURATION,
      slotsPerFrame: options.slotsPerFrame || ACOUSTIC_CONFIG.SLOTS_PER_FRAME,
      frameDuration: options.frameDuration || ACOUSTIC_CONFIG.FRAME_DURATION
    };

    // Slot allocation
    this.assignedSlots = [];
    this.pendingSlotRequests = [];
    this.slotTable = new Map(); // deviceId -> [slots]

    // Frame timing
    this.frameStartTime = 0;
    this.currentSlot = 0;
    this.frameNumber = 0;

    // Queue management
    this.transmitQueue = [];
    this.receiveBuffer = [];

    // Collision detection
    this.collisionCount = 0;
    this.successCount = 0;

    // Priority system
    this.priorityLevel = options.priority || 5; // 0-10, higher = more priority

    // State
    this.state = DEVICE_STATES.IDLE;
    this.isCoordinator = false;

    // Callbacks
    this.onSlotStart = null;
    this.onSlotEnd = null;
    this.onCollision = null;
    this.onTransmitOpportunity = null;

    // Statistics
    this.stats = {
      framesSent: 0,
      framesReceived: 0,
      collisions: 0,
      retransmissions: 0,
      slotUtilization: 0
    };

    // Start frame timer
    this._startFrameTimer();
  }

  /**
   * Start the TDMA frame timer
   */
  _startFrameTimer() {
    // Synchronize to wall clock for frame boundaries
    const now = Date.now();
    const msIntoFrame = now % this.config.frameDuration;
    const msUntilNextFrame = this.config.frameDuration - msIntoFrame;

    // Initial sync
    setTimeout(() => {
      this.frameStartTime = Date.now();
      this.frameNumber = Math.floor(Date.now() / this.config.frameDuration);
      this._onFrameStart();

      // Start regular frame timer
      this.frameInterval = setInterval(() => {
        this.frameNumber++;
        this.frameStartTime = Date.now();
        this._onFrameStart();
      }, this.config.frameDuration);
    }, msUntilNextFrame);

    // Slot timer
    this.slotInterval = setInterval(() => {
      this._onSlotTick();
    }, this.config.slotDuration);
  }

  /**
   * Handle frame start
   */
  _onFrameStart() {
    this.currentSlot = 0;

    // Process pending slot requests
    this._processSlotRequests();

    // Update slot utilization stats
    const usedSlots = Array.from(this.slotTable.values()).flat().length;
    this.stats.slotUtilization = usedSlots / this.config.slotsPerFrame;
  }

  /**
   * Handle slot tick
   */
  _onSlotTick() {
    const previousSlot = this.currentSlot;
    this.currentSlot = Math.floor(
      (Date.now() - this.frameStartTime) / this.config.slotDuration
    ) % this.config.slotsPerFrame;

    // Slot changed
    if (this.currentSlot !== previousSlot) {
      if (this.onSlotEnd) {
        this.onSlotEnd(previousSlot);
      }

      if (this.onSlotStart) {
        this.onSlotStart(this.currentSlot);
      }

      // Check if this is our slot
      if (this.assignedSlots.includes(this.currentSlot)) {
        this._handleOwnSlot();
      }
    }
  }

  /**
   * Handle our assigned slot - transmit opportunity
   */
  _handleOwnSlot() {
    if (this.transmitQueue.length > 0 && this.onTransmitOpportunity) {
      const frame = this.transmitQueue.shift();
      this.onTransmitOpportunity(frame);
      this.stats.framesSent++;
    }
  }

  /**
   * Request a slot for transmission
   * @param {number} numSlots - Number of slots requested
   * @returns {Promise<Object>} - Slot assignment result
   */
  async requestSlots(numSlots = 1) {
    return new Promise((resolve) => {
      const request = {
        deviceId: this.deviceId,
        numSlots: numSlots,
        priority: this.priorityLevel,
        timestamp: Date.now(),
        callback: resolve
      };

      this.pendingSlotRequests.push(request);
    });
  }

  /**
   * Process pending slot requests (coordinator function)
   */
  _processSlotRequests() {
    if (!this.isCoordinator && this.pendingSlotRequests.length > 0) {
      // In non-coordinator mode, use contention-based slot selection
      this._contentionBasedSlotSelection();
      return;
    }

    // Coordinator mode: assign slots fairly
    const availableSlots = this._getAvailableSlots();

    // Sort requests by priority
    this.pendingSlotRequests.sort((a, b) => b.priority - a.priority);

    for (const request of this.pendingSlotRequests) {
      const slotsToAssign = [];

      for (let i = 0; i < request.numSlots && availableSlots.length > 0; i++) {
        // Assign slots spread across the frame for fairness
        const slotIndex = Math.floor(availableSlots.length * (i + 1) / (request.numSlots + 1));
        const slot = availableSlots.splice(slotIndex, 1)[0];
        slotsToAssign.push(slot);
      }

      if (slotsToAssign.length > 0) {
        this.slotTable.set(request.deviceId, slotsToAssign);

        if (request.deviceId === this.deviceId) {
          this.assignedSlots = slotsToAssign;
        }

        request.callback({
          success: true,
          slots: slotsToAssign,
          frameNumber: this.frameNumber
        });
      } else {
        request.callback({
          success: false,
          reason: 'No slots available'
        });
      }
    }

    this.pendingSlotRequests = [];
  }

  /**
   * Contention-based slot selection (ALOHA-like)
   */
  _contentionBasedSlotSelection() {
    for (const request of this.pendingSlotRequests) {
      // Pick random slots based on device ID hash and priority
      const slots = [];
      const hash = this._hashDeviceId(request.deviceId);

      for (let i = 0; i < request.numSlots; i++) {
        // Use hash and priority to select slot
        const baseSlot = (hash + i * 7) % this.config.slotsPerFrame;
        const priorityOffset = Math.floor(request.priority / 2);
        const slot = (baseSlot + priorityOffset) % this.config.slotsPerFrame;
        slots.push(slot);
      }

      if (request.deviceId === this.deviceId) {
        this.assignedSlots = slots;
      }

      this.slotTable.set(request.deviceId, slots);

      request.callback({
        success: true,
        slots: slots,
        contention: true
      });
    }

    this.pendingSlotRequests = [];
  }

  /**
   * Simple hash function for device ID
   */
  _hashDeviceId(deviceId) {
    let hash = 0;
    for (let i = 0; i < deviceId.length; i++) {
      hash = ((hash << 5) - hash) + deviceId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get list of available (unassigned) slots
   */
  _getAvailableSlots() {
    const usedSlots = new Set();
    for (const slots of this.slotTable.values()) {
      slots.forEach(s => usedSlots.add(s));
    }

    const available = [];
    for (let i = 0; i < this.config.slotsPerFrame; i++) {
      if (!usedSlots.has(i)) {
        available.push(i);
      }
    }
    return available;
  }

  /**
   * Queue a frame for transmission
   * @param {Object} frame - Frame to transmit
   * @param {number} priority - Transmission priority
   */
  queueFrame(frame, priority = 0) {
    this.transmitQueue.push({
      frame: frame,
      priority: priority,
      timestamp: Date.now(),
      retries: 0
    });

    // Sort by priority
    this.transmitQueue.sort((a, b) => b.priority - a.priority);

    // Request slots if we don't have any
    if (this.assignedSlots.length === 0) {
      this.requestSlots(1);
    }
  }

  /**
   * Receive a frame (called by physical layer)
   * @param {Object} frame - Received frame
   */
  receiveFrame(frame) {
    this.stats.framesReceived++;

    // Check for collision (received during our transmit slot)
    if (this.assignedSlots.includes(this.currentSlot)) {
      this.stats.collisions++;
      if (this.onCollision) {
        this.onCollision({
          slot: this.currentSlot,
          frame: frame
        });
      }

      // Exponential backoff - request new slot
      this._handleCollision();
      return;
    }

    this.receiveBuffer.push({
      frame: frame,
      slot: this.currentSlot,
      timestamp: Date.now()
    });
  }

  /**
   * Handle collision with exponential backoff
   */
  _handleCollision() {
    this.collisionCount++;

    // Calculate backoff
    const maxBackoff = Math.min(16, Math.pow(2, this.collisionCount));
    const backoffSlots = Math.floor(Math.random() * maxBackoff);

    // Reassign to new slot
    const newSlot = (this.currentSlot + backoffSlots) % this.config.slotsPerFrame;
    this.assignedSlots = [newSlot];

    // Requeue the frame
    if (this.transmitQueue.length > 0) {
      this.transmitQueue[0].retries++;
      this.stats.retransmissions++;
    }
  }

  /**
   * Register this device as coordinator
   */
  becomeCoordinator() {
    this.isCoordinator = true;
    // Coordinator gets slot 0 for beacons
    this.assignedSlots = [0];
    this.slotTable.set(this.deviceId, [0]);
  }

  /**
   * Update device's slot allocation (from coordinator)
   */
  updateSlotTable(deviceId, slots) {
    this.slotTable.set(deviceId, slots);
    if (deviceId === this.deviceId) {
      this.assignedSlots = slots;
    }
  }

  /**
   * Get current slot information
   */
  getSlotInfo() {
    return {
      currentSlot: this.currentSlot,
      frameNumber: this.frameNumber,
      assignedSlots: this.assignedSlots,
      isOurSlot: this.assignedSlots.includes(this.currentSlot),
      slotTable: Object.fromEntries(this.slotTable),
      queueLength: this.transmitQueue.length
    };
  }

  /**
   * Get MAC statistics
   */
  getStats() {
    return {
      ...this.stats,
      collisionRate: this.stats.collisions / (this.stats.framesSent + 1),
      throughput: this.stats.framesSent / ((Date.now() - this.frameStartTime) / 1000)
    };
  }

  /**
   * Release assigned slots
   */
  releaseSlots() {
    this.slotTable.delete(this.deviceId);
    this.assignedSlots = [];
  }

  /**
   * Clean up
   */
  dispose() {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
    }
    if (this.slotInterval) {
      clearInterval(this.slotInterval);
    }
  }
}

export default MACLayer;
