// ============================================================================
// StratosGTM — Browser-Native Speech Synthesis Controller (Web Speech API)
// Provides audible spoken voice for simulation mode, judge tours, & offline evals
// ============================================================================

export type SpeechCallback = () => void;

class SpeechSynthController {
  private synth: SpeechSynthesis | null = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private speaking: boolean = false;
  private enabled: boolean = true;
  private onBoundaryCallback: SpeechCallback | null = null;
  private onStartCallback: SpeechCallback | null = null;
  private onEndCallback: SpeechCallback | null = null;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.cancel();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.initVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.initVoices();
      }
    }
  }

  private initVoices(): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return;

    // Prioritize natural female voices suitable for Anna (Executive AI Growth Operator)
    const preferredNames = [
      'Samantha',
      'Google US English',
      'Microsoft Zira',
      'Victoria',
      'Karen',
      'Fiona',
      'Moira'
    ];

    for (const name of preferredNames) {
      const match = voices.find(
        (v) => v.name.includes(name) && v.lang.startsWith('en')
      );
      if (match) {
        this.selectedVoice = match;
        return;
      }
    }

    // Fallback: any en-US or en voice
    const englishVoice =
      voices.find((v) => v.lang.startsWith('en-US')) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (englishVoice) {
      this.selectedVoice = englishVoice;
    }
  }

  /**
   * Strip markdown syntax, symbols, URLs, and code blocks before speaking
   */
  public cleanTextForSpeech(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/\[\[([^|\]]+)\|?([^\]]+)?\]\]/g, (_m, p1, p2) => p2 || p1) // Obsidian wikilinks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Standard markdown links
      .replace(/[*_~#]/g, '') // Formatting stars and hashes
      .replace(/https?:\/\/\S+/g, '') // URLs
      .replace(/\s+/g, ' ') // Collapse whitespace
      .trim();
  }

  public setCallbacks(callbacks: {
    onStart?: SpeechCallback;
    onBoundary?: SpeechCallback;
    onEnd?: SpeechCallback;
  }): void {
    this.onStartCallback = callbacks.onStart || null;
    this.onBoundaryCallback = callbacks.onBoundary || null;
    this.onEndCallback = callbacks.onEnd || null;
  }

  public speak(
    rawText: string,
    onComplete?: () => void,
    onBoundary?: () => void
  ): void {
    if (!this.synth || !this.enabled) {
      if (onComplete) onComplete();
      return;
    }

    // Cancel any active speech before starting new turn
    this.cancel();

    const cleanText = this.cleanTextForSpeech(rawText);
    if (!cleanText) {
      if (onComplete) onComplete();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }

    utterance.rate = 1.04; // Natural, polished conversational pace
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.speaking = true;
      if (this.onStartCallback) this.onStartCallback();
    };

    utterance.onboundary = () => {
      if (onBoundary) onBoundary();
      if (this.onBoundaryCallback) this.onBoundaryCallback();
    };

    utterance.onend = () => {
      this.speaking = false;
      if (this.onEndCallback) this.onEndCallback();
      if (onComplete) onComplete();
    };

    utterance.onerror = (e) => {
      console.warn('[SpeechSynthesis Error]', e);
      this.speaking = false;
      if (this.onEndCallback) this.onEndCallback();
      if (onComplete) onComplete();
    };

    this.synth.speak(utterance);
  }

  public cancel(): void {
    if (this.synth) {
      this.synth.cancel();
    }
    this.speaking = false;
    if (this.onEndCallback) this.onEndCallback();
  }

  public isSpeaking(): boolean {
    return this.speaking || (this.synth ? this.synth.speaking : false);
  }

  public getVoiceName(): string {
    return this.selectedVoice ? this.selectedVoice.name : 'Default System Voice';
  }
}

export const speechSynth = new SpeechSynthController();
