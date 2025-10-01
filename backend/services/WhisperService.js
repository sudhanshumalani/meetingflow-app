const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

class WhisperService {
  constructor() {
    // Auto-detect platform and set correct binary path
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows binary path
      this.whisperBinary = path.join(
        __dirname,
        '../whisper-bin/whisper.cpp-binaries-windows-x64-cpu-latest-patched-20240409/main.exe'
      );
    } else {
      // Linux binary path (for Render deployment)
      // Try to find the main binary in whisper-bin directory
      const linuxBinaryDir = path.join(__dirname, '../whisper-bin');
      this.whisperBinary = this.findWhisperBinary(linuxBinaryDir) ||
                          path.join(linuxBinaryDir, 'main');
    }

    // Path to the Whisper model
    this.modelPath = process.env.WHISPER_MODEL_PATH ||
                     path.join(__dirname, '../models/ggml-base.en.bin');

    this.isInitialized = false;
  }

  // Helper to find whisper binary in extracted Linux tarball or built from source
  findWhisperBinary(baseDir) {
    const fs = require('fs');
    try {
      const findBinary = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            const found = findBinary(fullPath);
            if (found) return found;
          } else if ((entry.name === 'main' || entry.name === 'whisper-cli') && !entry.name.endsWith('.exe')) {
            return fullPath;
          }
        }
        return null;
      };
      return findBinary(baseDir);
    } catch (error) {
      return null;
    }
  }

  async initialize() {
    try {
      // Check if binary exists
      await fs.access(this.whisperBinary);
      console.log(`✓ Whisper binary found: ${this.whisperBinary}`);

      // Check if model exists
      await fs.access(this.modelPath);
      console.log(`✓ Whisper model loaded from: ${this.modelPath}`);

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Whisper initialization failed:');
      console.error('Binary path:', this.whisperBinary);
      console.error('Model path:', this.modelPath);
      console.error('Error:', error.message);
      throw new Error('Whisper service initialization failed');
    }
  }

  async transcribe(audioFilePath) {
    if (!this.isInitialized) {
      throw new Error('Whisper service not initialized');
    }

    try {
      console.log(`Transcribing: ${audioFilePath}`);

      // Resolve to absolute path
      const absoluteAudioPath = path.resolve(audioFilePath);
      const absoluteModelPath = path.resolve(this.modelPath);

      // Call whisper.cpp binary directly
      const result = await this.runWhisper(absoluteAudioPath, absoluteModelPath);

      const transcript = result.trim();

      if (transcript) {
        console.log(`✓ Transcription complete: "${transcript.substring(0, 50)}..."`);
      } else {
        console.log('⚠️ Transcription returned empty result (silence or short audio)');
      }

      return transcript;
    } catch (error) {
      console.error('Transcription error:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  runWhisper(audioPath, modelPath) {
    return new Promise((resolve, reject) => {
      // REMOVED -nt and -np flags to see ALL output including errors!
      const args = [
        '-m', modelPath,
        '-f', audioPath,
        '-l', 'en',
        '--no-timestamps'
      ];

      console.log(`Running: ${this.whisperBinary} ${args.join(' ')}`);

      const whisperProcess = spawn(this.whisperBinary, args, {
        cwd: path.dirname(this.whisperBinary),
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';

      whisperProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      whisperProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      whisperProcess.on('error', (error) => {
        console.error('Failed to start whisper process:', error);
        reject(error);
      });

      whisperProcess.on('close', (code) => {
        // ENHANCED LOGGING - Always log full output
        console.log('=== WHISPER FULL OUTPUT ===');
        console.log('Exit code:', code);
        console.log('--- stdout ---');
        console.log(stdout);
        console.log('--- stderr ---');
        console.log(stderr);
        console.log('=== END OUTPUT ===');

        if (code === 0) {
          // Extract transcript from stdout
          const lines = stdout.split('\n');
          const transcriptLines = lines.filter(line => {
            // Filter out progress/info lines, keep only transcript content
            return line.trim() &&
                   !line.includes('[') &&
                   !line.includes('whisper_') &&
                   !line.includes('system_info') &&
                   !line.includes('processing') &&
                   !line.includes('main:') &&
                   !line.includes('sampling') &&
                   !line.includes('encode');
          });

          const transcript = transcriptLines.join(' ').trim();
          resolve(transcript);
        } else {
          console.error('❌ Whisper process FAILED');
          // Include BOTH stdout and stderr in error
          const errorDetails = stderr || stdout || 'No error output';
          reject(new Error(`Whisper process exited with code ${code}: ${errorDetails}`));
        }
      });
    });
  }
}

module.exports = WhisperService;
