# Browser OCR assets

- NDLOCR-Lite models and character table by the National Diet Library, CC BY 4.0. https://github.com/ndl-lab/ndlocr-lite
- Browser recognizer adapted from Yuta Hashimoto's NDLOCR-Lite Web, commit 50216cc, CC BY 4.0. https://github.com/yuta1984/ndlocrlite-web
- ONNX Runtime Web 1.24.3, MIT. https://github.com/microsoft/onnxruntime/tree/v1.24.3

The recognizer was built with Vite's relative base. Model and character-table URLs are resolved relative to the worker. The recognizer uses a gzip-compressed model and WASM binary, decompressed locally. Large floating-point initializers use per-axis symmetric weights in the range -15 to 15 and DequantizeLinear at inference. The original detector and the other recognition models are excluded from this bundle.
