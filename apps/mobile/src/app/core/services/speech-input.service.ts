import { Injectable, OnDestroy, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { AppLocale } from '../i18n/locale';

type TranscriptHandler = (text: string) => void;
export type SpeechStartResult = 'started' | 'unsupported' | 'denied';

interface WebSpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: WebSpeechRecognitionEvent) => void) | null;
  onerror: ((event: WebSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface WebSpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface WebSpeechRecognitionErrorEvent extends Event {
  error: string;
}

@Injectable({ providedIn: 'root' })
export class SpeechInputService implements OnDestroy {
  readonly listening = signal(false);
  readonly supported = signal(false);

  private transcriptHandler?: TranscriptHandler;
  private webRecognition?: WebSpeechRecognition;
  private webTranscriptBase = '';

  constructor() {
    void this.detectSupport();
  }

  ngOnDestroy() {
    void this.stop();
  }

  async detectSupport(): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { SpeechRecognition } = await import(
          '@capacitor-community/speech-recognition'
        );
        const { available } = await SpeechRecognition.available();
        this.supported.set(available);
        return available;
      } catch {
        this.supported.set(false);
        return false;
      }
    }

    const webSupported = !!this.getWebSpeechRecognitionCtor();
    this.supported.set(webSupported);
    return webSupported;
  }

  async start(
    locale: AppLocale,
    handler: TranscriptHandler,
  ): Promise<SpeechStartResult> {
    if (this.listening()) return 'started';

    this.transcriptHandler = handler;
    if (Capacitor.isNativePlatform()) {
      return this.startNative(locale);
    }
    return this.startWeb(locale);
  }

  async stop(): Promise<void> {
    if (!this.listening()) return;

    // Drop the handler first so late final/partial results cannot rewrite the draft
    // after the caller has already sent and cleared it.
    this.transcriptHandler = undefined;

    if (Capacitor.isNativePlatform()) {
      await this.stopNative();
      return;
    }

    this.stopWeb();
  }

  async toggle(
    locale: AppLocale,
    handler: TranscriptHandler,
  ): Promise<'started' | 'stopped' | SpeechStartResult> {
    if (this.listening()) {
      await this.stop();
      return 'stopped';
    }
    return this.start(locale, handler);
  }

  private async startNative(locale: AppLocale): Promise<SpeechStartResult> {
    const { SpeechRecognition } = await import(
      '@capacitor-community/speech-recognition'
    );

    const permission = await SpeechRecognition.requestPermissions();
    if (permission.speechRecognition !== 'granted') {
      return 'denied';
    }

    const { available } = await SpeechRecognition.available();
    if (!available) {
      return 'unsupported';
    }

    await SpeechRecognition.removeAllListeners();
    await SpeechRecognition.addListener(
      'partialResults',
      (data) => {
        const text = data.matches?.[0]?.trim();
        if (text) this.transcriptHandler?.(text);
      },
    );
    await SpeechRecognition.addListener(
      'listeningState',
      (data) => {
        if (data.status === 'stopped') {
          this.listening.set(false);
        }
      },
    );

    await SpeechRecognition.start({
      language: this.speechLocale(locale),
      maxResults: 1,
      partialResults: true,
      popup: false,
    });

    this.listening.set(true);
    return 'started';
  }

  private async stopNative(): Promise<void> {
    const { SpeechRecognition } = await import(
      '@capacitor-community/speech-recognition'
    );
    try {
      await SpeechRecognition.stop();
    } finally {
      await SpeechRecognition.removeAllListeners();
      this.transcriptHandler = undefined;
      this.listening.set(false);
    }
  }

  private startWeb(locale: AppLocale): SpeechStartResult {
    const Ctor = this.getWebSpeechRecognitionCtor();
    if (!Ctor) return 'unsupported';

    this.webTranscriptBase = '';
    const recognition = new Ctor();
    recognition.lang = this.speechLocale(locale);
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interim = '';
      let finals = this.webTranscriptBase;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          finals += text;
          this.webTranscriptBase = finals;
        } else {
          interim += text;
        }
      }
      this.transcriptHandler?.(`${finals}${interim}`.trim());
    };

    recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        this.listening.set(false);
      }
    };

    recognition.onend = () => {
      this.listening.set(false);
      this.webRecognition = undefined;
    };

    try {
      recognition.start();
      this.webRecognition = recognition;
      this.listening.set(true);
      return 'started';
    } catch {
      return 'unsupported';
    }
  }

  private stopWeb(): void {
    const recognition = this.webRecognition;
    if (recognition) {
      // Detach handlers before stop(); Web Speech API often delivers a final
      // onresult asynchronously after stop(), which would otherwise refill draft.
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.stop();
    }
    this.webRecognition = undefined;
    this.transcriptHandler = undefined;
    this.webTranscriptBase = '';
    this.listening.set(false);
  }

  private getWebSpeechRecognitionCtor():
    | (new () => WebSpeechRecognition)
    | undefined {
    const win = window as Window & {
      SpeechRecognition?: new () => WebSpeechRecognition;
      webkitSpeechRecognition?: new () => WebSpeechRecognition;
    };
    return win.SpeechRecognition ?? win.webkitSpeechRecognition;
  }

  private speechLocale(locale: AppLocale): string {
    return locale === 'es' ? 'es-ES' : 'en-US';
  }
}
