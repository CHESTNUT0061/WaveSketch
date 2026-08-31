export interface LocalizedText { zh: string; en: string; }

export interface ChangelogEntry {
  version: string;
  date: string;
  comparison: LocalizedText;
  changes: LocalizedText[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.0.7', date: '2026-08-31',
    comparison: { zh: '相对于 v1.0.6', en: 'Compared with v1.0.6' },
    changes: [
      { zh: '增加可编辑文字标注：支持中英文默认内容、换行、字体、字号、颜色、粗体、斜体、对齐、右键设置和按内容自动调整标注框大小。', en: 'Added editable text annotations with default Chinese and English content, multiline input, font, size, color, bold, italic, alignment, right-click settings, and content-based sizing.' },
      { zh: '文字标注支持选中、框选、移动、删除、复制粘贴、保存导入，以及在 SVG 中保持可编辑文字。', en: 'Text annotations can be selected, rubber-band selected, moved, deleted, copied, pasted, saved, imported, and preserved as editable SVG text.' },
      { zh: '增加统一导出图片窗口：可选择网格、坐标轴、图例、Cursor 和 PNG/SVG 格式，并支持大尺寸及点击放大预览。', en: 'Added a unified image export dialog with grid, axes, legend, Cursor, PNG/SVG format options, and large click-to-enlarge previews.' },
      { zh: '跨应用复制按选中内容导出波形和文字，外部应用以图片粘贴为主，同时附带 SVG 数据；是否能作为可编辑矢量对象接收取决于目标应用，不包含网格、坐标轴、图例或 Cursor。', en: 'Cross-application copy exports only selected waveforms and text and is primarily pasted as an image; SVG data is also provided, but editable-vector support depends on the target application. Grid, axes, legend, and Cursor are excluded.' },
      { zh: '修复网格值负数问题，最小值保持为 0.001；Cursor 显示数值保留小数点后 3 位。', en: 'Fixed negative grid values; the minimum remains 0.001. Cursor values now display up to three decimal places.' },
      { zh: '优化手机、Pad 和网页端的浮动控件与面板布局，并增加 Analog Canvas 推荐链接。', en: 'Improved floating controls and panel layouts on phone, Pad, and web, and added the Analog Canvas recommendation link.' },
    ],
  },
  {
    version: '1.0.6', date: '2026-08-21',
    comparison: { zh: '相对于 v1.0.5', en: 'Compared with v1.0.5' },
    changes: [
      { zh: '删除模式支持单条删除和框选批量删除，并支持撤销与恢复。', en: 'Delete mode supports single and box-selected batch deletion with undo and redo.' },
      { zh: '波形和波形组支持任意方向或横纵方向移动，Shift 可临时锁定移动方向。', en: 'Waveforms and groups support free or axis-aligned movement, with temporary Shift locking.' },
      { zh: '缩放栏支持展开、收起和拖动，增加操作提示，并自动保持在画面内。', en: 'Zoom controls can collapse, expand, and move, with help text and in-bounds positioning.' },
      { zh: '优化手机、Pad 和网页端的坐标设置、位移提示与工具栏布局。', en: 'Improved axis settings, movement readouts, and toolbar layout across phone, Pad, and web.' },
      { zh: '波形显示和 SVG/PNG 导出采用圆角线条，Cursor 支持可选的网格吸附。', en: 'Waveform display and SVG/PNG export use rounded lines; Cursor grid snapping is optional.' },
    ],
  },
  {
    version: '1.0.5', date: '2026-08-04',
    comparison: { zh: '相对于 v1.0.2', en: 'Compared with v1.0.2' },
    changes: [
      { zh: '优化画布坐标差值提示的显示效果。', en: 'Improved the canvas coordinate-difference readout.' },
      { zh: '优化手机端键盘弹出时波形面板的显示。', en: 'Improved the mobile waveform panel when the keyboard opens.' },
    ],
  },
  {
    version: '1.0.2', date: '2026-08-02',
    comparison: { zh: '相对于 v1.0.1', en: 'Compared with v1.0.1' },
    changes: [
      { zh: '提升算术表达式计算的可靠性。', en: 'Improved the reliability of arithmetic expression evaluation.' },
      { zh: '减少计算结果中的浮点误差。', en: 'Reduced floating-point noise in calculation results.' },
    ],
  },
  {
    version: '1.0.1', date: '2026-08-02',
    comparison: { zh: '相对于 v1.0.0', en: 'Compared with v1.0.0' },
    changes: [
      { zh: '增加手机端和 Pad 端适配。', en: 'Added phone and Pad layouts.' },
      { zh: '优化坐标设置、波形面板和底部菜单的使用体验。', en: 'Improved axis settings, waveform panels, and footer menus.' },
    ],
  },
  {
    version: '1.0.0', date: '2026-08-01',
    comparison: { zh: '首个公开版本', en: 'Initial public version' },
    changes: [
      { zh: '提供波形绘制、编辑、生成、计算、分组、Cursor 和 SVG/PNG 导出。', en: 'Introduced waveform drawing, editing, generation, calculation, grouping, Cursors, and SVG/PNG export.' },
      { zh: '提供基础的响应式工作区和移动端界面。', en: 'Introduced the responsive workspace and mobile interface.' },
    ],
  },
];
