/**
 * AudioWorklet Processor for Real-Time Tab Audio Streaming
 *
 * Converts Float32 audio to Int16 format for AssemblyAI
 * Runs off the main thread for optimal performance
 */

class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super()

    // AssemblyAI v3 requires 50-1000ms of audio per message
    // At 16000 Hz: 50ms = 800 samples, 100ms = 1600 samples
    this.bufferSize = 1600 // 100ms at 16kHz
    this.buffer = new Float32Array(this.bufferSize)
    this.bufferIndex = 0

    console.log('🎧 AudioStreamProcessor initialized (buffering 100ms chunks)')
  }

  /**
   * Process audio in real-time
   * @param {Float32Array[][]} inputs - Audio input data
   * @param {Float32Array[][]} outputs - Audio output data (not used)
   * @param {Object} parameters - Audio parameters
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0]

    if (!input || !input[0]) {
      return true // Keep processor alive
    }

    const audioData = input[0] // Get first channel

    if (audioData.length === 0) {
      return true
    }

    // Add audio to buffer
    for (let i = 0; i < audioData.length; i++) {
      this.buffer[this.bufferIndex++] = audioData[i]

      // When buffer is full, send it
      if (this.bufferIndex >= this.bufferSize) {
        // Convert Float32 to Int16 for AssemblyAI
        const int16Data = this.float32ToInt16(this.buffer.slice(0, this.bufferIndex))

        // Send to main thread via message port
        this.port.postMessage({
          type: 'audio',
          data: int16Data
        })

        // Reset buffer
        this.bufferIndex = 0
      }
    }

    return true // Keep processor alive
  }

  /**
   * Convert Float32Array to Int16Array
   * AssemblyAI requires PCM16 format
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length)

    for (let i = 0; i < float32Array.length; i++) {
      // Clamp values to -1.0 to 1.0 range
      const s = Math.max(-1, Math.min(1, float32Array[i]))

      // Convert to 16-bit integer
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }

    return int16Array
  }
}

// Register the processor
registerProcessor('audio-stream-processor', AudioStreamProcessor)
