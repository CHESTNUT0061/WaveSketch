export interface LocalizedText { zh: string; en: string; }

export interface ChangelogEntry {
  version: string;
  date: string;
  comparison: LocalizedText;
  changes: LocalizedText[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
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
