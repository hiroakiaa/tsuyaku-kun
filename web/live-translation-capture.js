export async function captureLiveTranslationPcm(stream, { signal, onAudio }) {
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  const context = new Context();
  let source, node, muted, closed = false;
  let acknowledgeFlush;
  function stop() {
    if (closed) return;
    closed = true;
    acknowledgeFlush?.();
    signal?.removeEventListener('abort', stop);
    if (node) node.port.onmessage = null;
    source?.disconnect();
    node?.disconnect();
    muted?.disconnect();
    void context.close().catch(() => {});
  }

  try {
    signal?.throwIfAborted();
    signal?.addEventListener('abort', stop, { once: true });
    await context.audioWorklet.addModule(new URL('./caption-stream-pcm.js?v=live-tail-1', import.meta.url));
    signal?.throwIfAborted();
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'caption-stream-pcm', {
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { outputRate: 24000 },
    });
    muted = context.createGain();
    muted.gain.value = 0;
    node.port.onmessage = ({ data }) => {
      if (data === "flushed") acknowledgeFlush?.();
      else if (!closed && data instanceof Int16Array) onAudio(data.buffer);
    };
    source.connect(node).connect(muted).connect(context.destination);
    await context.resume();
    signal?.throwIfAborted();
    stop.flush = () => new Promise(resolve => {
      const timeout = setTimeout(done, 300);
      function done() {
        clearTimeout(timeout);
        acknowledgeFlush = undefined;
        resolve();
      }
      acknowledgeFlush = done;
      node.port.postMessage('flush');
    });
    return stop;
  } catch (error) {
    stop();
    throw error;
  }
}
