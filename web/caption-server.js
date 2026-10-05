// Browser-independent recognition using the call's existing microphone stream.
export function encodeWav(samples) {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const word = (at, text) => { for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i)); };
  word(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return bytes;
}

export function createServerRecognition({ endpoint, getStream, getToken, fetcher = fetch, onUsage = () => {},
  Context = window.AudioContext || window.webkitAudioContext, Worklet = window.AudioWorkletNode }) {
  return class ServerRecognition {
    constructor() { this.active = false; this.queue = []; this.sending = false; this.index = 0; this.getHints = () => []; }
    setHints(getHints) { this.getHints = typeof getHints === 'function' ? getHints : () => []; }
    start() {
      this.active = true;
      this.startTimer = setTimeout(() => { if (this.active) this.fail('audio-capture'); }, 8000);
      // Must be called synchronously from the caption/microphone button on iOS.
      try {
        const stream = getStream();
        if (!stream?.getAudioTracks().some(track => track.readyState === 'live' && track.enabled)) throw new Error('microphone');
        this.context = new Context();
        const resumed = this.context.resume();
        void this.prepare(stream, resumed);
      } catch (_) { this.fail('audio-capture'); }
    }
    async prepare(stream, resumed) {
      try {
        await resumed;
        await this.context.audioWorklet.addModule(new URL('./caption-pcm.js?v=2026-09-03-faster-terms', import.meta.url));
        if (!this.active) return;
        this.source = this.context.createMediaStreamSource(stream);
        this.node = new Worklet(this.context, 'caption-pcm');
        this.node.port.onmessage = event => {
          if (!this.active) return;
          if (this.queue.length >= 2) { event.data.fill(0); this.fail('overloaded'); return; }
          this.queue.push({ samples: event.data, at: Date.now() });
          void this.drain();
        };
        this.source.connect(this.node); this.node.connect(this.context.destination);
        this.context.onstatechange = () => {
          if (this.active && this.context.state !== 'running') this.fail('interrupted');
        };
        if (this.context.state !== 'running') { this.fail('interrupted'); return; }
        clearTimeout(this.startTimer);this.onstart?.();
      } catch (_) { if (this.active) this.fail('audio-capture'); }
    }
    async drain() {
      if (this.sending || !this.active || !this.queue.length) return;
      this.sending = true;
      const chunk = this.queue.shift();
      const controller = new AbortController(); this.request = controller;
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const token = await getToken();
        if (!this.active) return;
        if (controller.signal.aborted) { this.fail('network'); return; }
        const body = encodeWav(chunk.samples); chunk.samples.fill(0);
        onUsage(chunk.samples.length / 16000);
        const hints = [...new Set((this.getHints() || []).filter(x => typeof x === 'string')
          .map(x => x.normalize('NFKC').trim()).filter(x => x && x.length <= 40))].slice(0, 30).join(',').slice(0, 300);
        const encodedHints=hints?encodeURIComponent(hints):'';
        const response = await fetcher(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'audio/wav', Authorization: 'Bearer ' + token,
            ...(encodedHints ? { 'X-Term-Hints': encodedHints } : {}) },
          body, signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'
        });
        if (!response.ok) { this.fail(response.status === 429 ? 'quota' : response.status === 401 ? 'auth' : 'network'); return; }
        const data = await response.json();
        if (!this.active || controller.signal.aborted || Date.now() - chunk.at > 15000) return;
        const text = typeof data.text === 'string' ? data.text.trim().slice(0, 600) : '';
        if (text) {
          // No cumulative transcript list is retained by the recognizer.
          const result = [{ transcript: text }]; result.isFinal = true;
          const results = { length: this.index + 1, [this.index]: result };
          this.onresult?.({ resultIndex: this.index++, results });
        }
      } catch (_) { if (this.active) this.fail('network'); }
      finally {
        chunk.samples.fill(0); clearTimeout(timeout); this.request = null; this.sending = false;
        if (this.active) void this.drain();
      }
    }
    fail(error) { const notify = this.onerror; this.abort(); notify?.({ error }); }
    abort() {
      clearTimeout(this.startTimer);
      this.active = false; this.request?.abort();
      for (const chunk of this.queue) chunk.samples.fill(0); this.queue=[];
      if (this.node) { this.node.port.onmessage = null; this.node.port.postMessage('stop'); this.node.disconnect(); }
      this.source?.disconnect();
      if (this.context) { this.context.onstatechange = null; void this.context.close().catch(() => {}); }
      // Never call stop() on the shared call microphone tracks.
    }
  };
}
