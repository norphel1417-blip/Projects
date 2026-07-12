/**
 * AudioWorklet processor that downsamples mic audio (typically 48 kHz)
 * to 16 kHz Int16 PCM and posts it to the main thread.
 */
class PCMDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSr = (options && options.processorOptions && options.processorOptions.targetSr) || 16000;
    this.inputSr = sampleRate;
    this.ratio = this.inputSr / this.targetSr;
    this.acc = 0.0;
    this.buffer = [];
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];
    // simple decimation with linear interpolation
    for (let i = 0; i < channel.length; i++) {
      this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        this.buffer.push(channel[i]);
        if (this.buffer.length >= 1024) {
          const i16 = new Int16Array(this.buffer.length);
          for (let k = 0; k < this.buffer.length; k++) {
            const s = Math.max(-1, Math.min(1, this.buffer[k]));
            i16[k] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          this.port.postMessage(i16.buffer, [i16.buffer]);
          this.buffer = [];
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm-downsampler", PCMDownsampler);
