const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');

// Platform-specific FFmpeg configuration
const isWindows = process.platform === 'win32';

if (isWindows) {
  // Windows: Use manually installed FFmpeg
  const FFMPEG_PATH = 'C:/ffmpeg/bin/ffmpeg.exe';
  const FFPROBE_PATH = 'C:/ffmpeg/bin/ffprobe.exe';
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
  ffmpeg.setFfprobePath(FFPROBE_PATH);
} else {
  // Linux/Render: Use system ffmpeg (installed via apt-get or package manager)
  // fluent-ffmpeg will auto-detect from PATH
  console.log('Using system ffmpeg from PATH');
}

class AudioProcessor {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.tempDir = path.join(__dirname, '../temp');
    this.ensureTempDir();
  }

  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
      console.log(`✓ Temp directory ready: ${this.tempDir}`);
    } catch (error) {
      console.error('Error creating temp directory:', error);
    }
  }

  async saveAudio(audioBuffer) {
    const filename = `${this.sessionId}_${uuidv4()}.webm`;
    const webmPath = path.join(this.tempDir, filename);
    const wavPath = webmPath.replace('.webm', '.wav');

    // Save the raw WebM audio
    await fs.writeFile(webmPath, audioBuffer);
    console.log(`✓ Saved WebM: ${filename} (${(audioBuffer.length / 1024).toFixed(2)} KB)`);

    // Convert to WAV format for Whisper
    await this.convertToWav(webmPath, wavPath);

    // Clean up the WebM file
    await fs.unlink(webmPath);

    return wavPath;
  }

  async convertToWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('wav')
        .audioCodec('pcm_s16le')  // CRITICAL: 16-bit PCM required by whisper.cpp
        .audioFrequency(16000)    // Whisper expects 16kHz
        .audioChannels(1)         // Mono audio
        .on('end', async () => {
          // Validate the converted file
          try {
            const stats = await fs.stat(outputPath);
            console.log(`✓ Converted to WAV: ${path.basename(outputPath)} (${(stats.size / 1024).toFixed(2)} KB)`);

            if (stats.size < 1000) {
              reject(new Error(`Converted WAV file too small: ${stats.size} bytes`));
              return;
            }

            resolve(outputPath);
          } catch (error) {
            reject(new Error(`Failed to validate converted WAV: ${error.message}`));
          }
        })
        .on('error', (err) => {
          console.error('FFmpeg conversion error:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async cleanup(filePath) {
    try {
      await fs.unlink(filePath);
      console.log(`✓ Cleaned up: ${path.basename(filePath)}`);
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  async cleanupAll() {
    try {
      const files = await fs.readdir(this.tempDir);
      const sessionFiles = files.filter(f => f.startsWith(this.sessionId));

      await Promise.all(
        sessionFiles.map(f => fs.unlink(path.join(this.tempDir, f)))
      );

      console.log(`✓ Cleaned up ${sessionFiles.length} files for session ${this.sessionId}`);
    } catch (error) {
      console.error('Cleanup all error:', error);
    }
  }

  async getStats() {
    try {
      const files = await fs.readdir(this.tempDir);
      return {
        totalFiles: files.length,
        sessionFiles: files.filter(f => f.startsWith(this.sessionId)).length
      };
    } catch (error) {
      return { totalFiles: 0, sessionFiles: 0 };
    }
  }
}

module.exports = AudioProcessor;
