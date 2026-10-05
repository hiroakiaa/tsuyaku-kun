// Shared by the AudioWorklet and tests. Only a bounded utterance is retained.
export class PcmSegmenter {
  constructor(rate, emit) {
    this.rate = rate; this.emit = emit;
    this.samples = new Int16Array(128000); this.length = 0;
    this.preroll = new Int16Array(6400); this.preIndex = 0; this.started = false;
    this.phase = 0; this.sum = 0; this.count = 0;
    this.voiced = 0; this.silence = 0;
  }
  push(input) {
    for (const value of input) {
      this.sum += value; this.count++; this.phase += 16000;
      if (this.phase < this.rate) continue;
      this.phase -= this.rate;
      const sample = this.sum / this.count; this.sum = 0; this.count = 0;
      const pcm = Math.round(Math.max(-1, Math.min(1, sample)) * 32767);
      if (!this.started) {
        if (Math.abs(sample) <= 0.006) { this.preroll[this.preIndex] = pcm; this.preIndex = (this.preIndex + 1) % this.preroll.length; continue; }
        this.samples.set(this.preroll.subarray(this.preIndex));
        this.samples.set(this.preroll.subarray(0, this.preIndex), this.preroll.length - this.preIndex);
        this.length = this.preroll.length; this.started = true; this.preroll.fill(0); this.preIndex = 0;
      }
      this.samples[this.length++] = pcm;
      if (Math.abs(sample) > 0.006) { this.voiced++; this.silence = 0; } else this.silence++;
      const forced = this.length === this.samples.length;
      if (forced || (this.length >= 40000 && this.silence >= 10400)) {
        if (this.voiced >= 2400) this.emit(this.samples.slice(0, this.length));
        // Preserve overlap only across a forced split. Natural pauses already
        // include a post-roll and do not need to be billed twice.
        const overlap=forced?this.samples.slice(this.length-this.preroll.length,this.length):null;
        this.samples.fill(0); this.length = 0; this.voiced = 0; this.silence = 0; this.started = false;
        if(overlap)this.preroll.set(overlap);
      }
    }
  }
  clear() { this.samples.fill(0); this.preroll.fill(0); this.preIndex = 0; this.started = false; this.length = 0; this.sum = 0; this.count = 0; this.phase = 0; this.voiced = 0; this.silence = 0; }
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class CaptionPcmProcessor extends AudioWorkletProcessor {
    constructor() {
      super(); this.active = true;
      this.segmenter = new PcmSegmenter(sampleRate, samples => this.port.postMessage(samples, [samples.buffer]));
      this.port.onmessage = () => { this.active = false; this.segmenter.clear(); };
    }
    process(inputs) {
      if (!this.active) return false;
      if (inputs[0]?.[0]) this.segmenter.push(inputs[0][0]);
      // Output stays silent: the call's microphone track is never modified.
      return true;
    }
  }
  registerProcessor('caption-pcm', CaptionPcmProcessor);
}
