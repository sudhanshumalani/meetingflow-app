/**
 * AudioWorklet Processor for Real-Time Tab Audio Streaming
 *
 * Converts Float32 audio to Int16 format for AssemblyAI
 * Runs off the main thread for optimal performance
 */

class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    console.log('🎧 AudioStreamProcessor initialized')
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

    // Convert Float32 to Int16 for AssemblyAI
    const int16Data = this.float32ToInt16(audioData)

    // Send to main thread via message port
    this.port.postMessage({
      type: 'audio',
      data: int16Data
    })

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
