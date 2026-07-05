# WaveSketch — 波形绘制工具

**🔗 Use it online (no installation): https://CHESTNUT0061.github.io/WaveSketch/**

A web-based tool for sketching idealized waveforms for power electronics papers and presentations. Draw, generate, and compute waveforms; export publication-ready SVG (Visio-editable) and high-res PNG.

面向电力电子 / 电源芯片科研场景的波形示意图绘制工具。打开网页即用，数据自动保存在浏览器本地。

## Features

- **Infinite canvas** — pan with middle-button or Space+drag, cursor-centered wheel zoom, one-click reset / fit-to-content
- **Waveform generator** — square, ramp (inductor current), sine, triangle, sawtooth, trapezoid, rectified sine, damped ringing; with duty cycle, multi-phase interleaving, and DC offset control
- **Waveform calculator** — full arithmetic expressions with `+`, `−`, `×`, parentheses, and constants, e.g. `(A + B) × 0.5` or instantaneous power `V × I`
- **Editing** — drag endpoints / midpoints (Bézier curves), rubber-band selection, batch delete, copy & paste, group move
- **Auto-save** — everything is saved to browser local storage in real time; refresh without losing work
- **Export**
  - **SVG** — layered by waveform group; paste into Visio and ungroup level by level down to individual segments
  - **PNG** — 3× resolution, ready for papers and slides
  - **JSON** — save and re-import for later editing

## License

[MIT](LICENSE)
