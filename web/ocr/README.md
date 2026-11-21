# Browser OCR assets

- NDLOCR-Lite models and character table by the National Diet Library, CC BY 4.0. https://github.com/ndl-lab/ndlocr-lite
- Browser recognizer adapted from Yuta Hashimoto's NDLOCR-Lite Web, commit 50216cc, CC BY 4.0. https://github.com/yuta1984/ndlocrlite-web
- ONNX Runtime Web 1.24.3, MIT. https://github.com/microsoft/onnxruntime/tree/v1.24.3

The recognizer was built with Vite's relative base. Model and character-table URLs are resolved relative to the worker. The recognizer uses a gzip-compressed model and WASM binary, decompressed locally. Large floating-point initializers use per-axis symmetric weights in the range -15 to 15 and DequantizeLinear at inference. The original detector and the other recognition models are excluded from this bundle.

## Local correction, 2026-11-21
The browser PARSEQ output decoder now follows the official NDLOCR-Lite `src/parseq.py` read method: stop at token0 and map every preceding token through charlist[index-1]. The previous browser adaptation incorrectly applied CTC-style consecutive-token deduplication and skipped tokens1–3 (space, !, quotation mark). This corrupted repeated digits/letters and punctuation. Original model and license are unchanged. Source: https://github.com/ndl-lab/ndlocr-lite/blob/master/src/parseq.py . Worker cache query raised to v3.
