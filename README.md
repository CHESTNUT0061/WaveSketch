# WaveSketch — 波形绘制工具

**🔗 在线使用（无需安装）：https://CHESTNUT0061.github.io/WaveSketch/**

A web-based tool for sketching idealized waveforms for power electronics papers and presentations. Draw, generate, and compute waveforms; export publication-ready SVG (Visio-editable) and high-res PNG.

面向电力电子 / 电源芯片科研场景的波形示意图绘制工具。打开网页即用，数据自动保存在浏览器本地。

## 主要功能

- **无限画布**：中键/空格+拖拽平移，滚轮以鼠标为中心缩放，一键复位/适应内容
- **波形生成器**：方波、Ramp（电感电流）、正弦、三角、锯齿、梯形、整流正弦、阻尼振荡（振铃），支持多相错相、占空比、直流偏置
- **波形计算器**：完整算术表达式（+、−、×、括号、常数），如 `(A + B) × 0.5`、瞬时功率 `V × I`
- **编辑**：拖动端点/中点（贝塞尔曲线）、框选、批量删除、复制粘贴、整组移动
- **自动保存**：所有内容实时存入浏览器本地，刷新不丢失
- **导出**：
  - **SVG** — 按波形组分组，粘贴进 Visio 后可逐级取消组合、单独编辑每条线段
  - **PNG** — 3 倍分辨率，可直接用于论文和 PPT
  - **JSON** — 存档备份，可导入继续编辑

## License

[MIT](LICENSE)
