// ============================================================================
// AssemblyAI Voice Agent Audio Pipeline (24 kHz PCM16 Mono Base64)
// ============================================================================

export class AudioPipeline {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private isRecording: boolean = false;
  private scheduledTime: number = 0;
  private playbackSources: AudioBufferSourceNode[] = [];

  /**
   * @param onAudioChunk receives base64 PCM16 for the socket.
   * @param onLevel receives the measured RMS amplitude (0..1) of the same
   *   buffer. This is a real measurement of the microphone signal, taken from
   *   the samples that are actually sent — the visualiser was previously driven
   *   by Math.random(), which animated convincingly while showing nothing.
   */
  constructor(
    private onAudioChunk: (base64Pcm16: string) => void,
    private onLevel?: (rms: number) => void
  ) {}

  public async startRecording(): Promise<void> {
    if (this.isRecording) return;

    this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24000
    });

    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 24000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

    // 2048 buffer size gives ~85ms chunks at 24kHz
    this.processorNode = this.audioCtx.createScriptProcessor(2048, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      if (!this.isRecording) return;
      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Int16 PCM, and accumulate the sum of squares in the
      // same pass. Measuring amplitude costs one multiply-add per sample here;
      // a second loop, or an AnalyserNode, would cost a second traversal of
      // every 2048-frame buffer for the same number.
      const pcm16 = new Int16Array(inputData.length);
      let sumSquares = 0;
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        sumSquares += s * s;
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      if (this.onLevel && inputData.length > 0) {
        this.onLevel(Math.sqrt(sumSquares / inputData.length));
      }

      // Convert Int16Array to binary string, then base64
      let binary = '';
      const bytes = new Uint8Array(pcm16.buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Audio = window.btoa(binary);

      this.onAudioChunk(base64Audio);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioCtx.destination);
    this.isRecording = true;
  }

  public stopRecording(): void {
    this.isRecording = false;
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  // ============================================================================
  // Playback Queue: Handles reply.audio chunks from AssemblyAI
  // ============================================================================

  public playChunk(base64Pcm: string): void {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000
      });
    }

    try {
      const binaryString = window.atob(base64Pcm);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);

      // Convert to Float32 for Web Audio playback
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const buffer = this.audioCtx.createBuffer(1, float32Array.length, 24000);
      buffer.copyToChannel(float32Array, 0);

      const source = this.audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioCtx.destination);

      source.onended = () => {
        this.playbackSources = this.playbackSources.filter((s) => s !== source);
      };
      this.playbackSources.push(source);

      const currentTime = this.audioCtx.currentTime;
      if (this.scheduledTime < currentTime) {
        this.scheduledTime = currentTime;
      }

      source.start(this.scheduledTime);
      this.scheduledTime += buffer.duration;
    } catch (err) {
      console.error('[Playback Error]', err);
    }
  }

  // Crucial for barge-in interruption: aborts queued playback immediately
  public abortPlayback(): void {
    if (this.audioCtx) {
      this.scheduledTime = this.audioCtx.currentTime;
    }
    this.playbackSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    });
    this.playbackSources = [];
    console.log('[AudioPipeline] Playback buffer aborted due to user barge-in.');
  }

  public cleanup(): void {
    this.stopRecording();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}
