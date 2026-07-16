import React, { createContext, useContext, useState, useCallback } from 'react';

export type Lang = 'zh' | 'en';

const LANG_KEY = 'wavesketch-lang';

// Translation dictionary. Each key maps to Chinese + English text.
// Use {n} placeholders for interpolation (see the t() helper).
const S = {
  appTitle: { zh: 'WaveSketch', en: 'WaveSketch' },

  // Tool buttons
  toolSelect: { zh: '选择', en: 'Select' },
  toolDraw: { zh: '绘制', en: 'Draw' },
  toolEdit: { zh: '编辑', en: 'Edit' },
  toolDelete: { zh: '删除', en: 'Delete' },
  toolMoveGroup: { zh: '移组', en: 'Move group' },

  // Top-right actions
  actionImport: { zh: '导入', en: 'Import' },
  actionExport: { zh: '导出', en: 'Export' },
  actionUndo: { zh: '撤销', en: 'Undo' },
  actionRedo: { zh: '恢复', en: 'Redo' },

  // Tooltips
  tipDraw: { zh: '点击并拖动画直线，吸附格点', en: 'Click and drag to draw a line, snapped to the grid' },
  tipEdit: { zh: '先选组，再拖动端点/中点/控制点；正弦波按半周期分段编辑', en: 'Select a group first, then drag endpoints / midpoints / control points; sine is edited in half-cycle segments' },
  tipDelete: { zh: '点击线段删除', en: 'Click a segment to delete it' },
  tipMoveGroup: { zh: '拖动整组波形移动', en: 'Drag to move the whole group' },
  tipSelect: { zh: '点击选中，拖空白框选，Shift连选，拖动移动，Delete删除，Ctrl+C复制', en: 'Click to select, drag empty space to rubber-band, Shift to multi-select, drag to move, Delete to remove, Ctrl+C to copy' },
  tipUndo: { zh: '撤销上一步操作', en: 'Undo the last action' },
  tipRedo: { zh: '恢复上一步操作', en: 'Redo the last action' },
  tipSvg: { zh: '导出SVG图片，可在Visio中编辑', en: 'Export SVG, editable in Visio' },
  tipPng: { zh: '导出高分辨率PNG图片（3倍分辨率）', en: 'Export a high-resolution PNG (3x)' },
  tipImport: { zh: '导入波形数据，继续上次编辑', en: 'Import waveform data to continue editing' },
  tipExport: { zh: '导出波形数据，方便下次编辑', en: 'Export waveform data for later editing' },

  // Zoom bar
  reset: { zh: '复位', en: 'Reset' },
  fitContent: { zh: '适应内容', en: 'Fit' },
  pan: { zh: '平移', en: 'Pan' },
  tipPan: { zh: '拖动平移画布（触屏单指拖动，双指捏合缩放）', en: 'Drag to pan the canvas (one-finger drag on touch, two-finger pinch to zoom)' },
  panHint: { zh: '中键/空格拖拽平移 · Shift+滚轮缩放横轴', en: 'Middle/Space+drag to pan · Shift+wheel zooms the X axis' },

  // Offset readouts
  cells: { zh: '格', en: 'cells' },
  copyPreviewHint: { zh: '复制预览 (Enter确认/Esc取消)', en: 'Paste preview (Enter to confirm / Esc to cancel)' },

  // Import error
  importError: { zh: '导入失败：文件格式不正确', en: 'Import failed: invalid file format' },

  // Axis settings
  axisSettings: { zh: '坐标设置', en: 'Axis settings' },
  yUnit: { zh: 'Y单位', en: 'Y unit' },
  xUnit: { zh: 'X单位', en: 'X unit' },
  minorGrid: { zh: '次格点', en: 'Minor' },
  majorGrid: { zh: '主格点', en: 'Major' },

  // Footer
  visitCountPrefix: { zh: '本工具已被使用', en: 'Used' },
  visitCountSuffix: { zh: '次', en: 'times' },
  visitorPrefix: { zh: '· 访客', en: '· visitors' },
  visitorSuffix: { zh: '人', en: '' },
  linkWpd: { zh: '推荐：曲线取点工具 WebPlotDigitizer', en: 'Recommended: WebPlotDigitizer (curve digitizer)' },
  linkFeedback: { zh: '意见反馈', en: 'Feedback' },
  linkGithub: { zh: 'GitHub', en: 'GitHub' },

  // Group panel
  groupPanelTitle: { zh: '波形组管理', en: 'Waveform Groups' },
  groupsLabel: { zh: '波形组', en: 'Groups' },
  newGroupPlaceholder: { zh: '新组名称', en: 'New group name' },
  noGroups: { zh: '暂无波形组', en: 'No groups yet' },
  clearAll: { zh: '清空所有', en: 'Clear all' },
  titleRename: { zh: '重命名', en: 'Rename' },
  titleRenameDbl: { zh: '双击重命名', en: 'Double-click to rename' },
  titleChangeColor: { zh: '修改颜色', en: 'Change color' },
  titleDuplicate: { zh: '复制组', en: 'Duplicate group' },

  // Group style panel
  presetColors: { zh: '预设颜色', en: 'Presets' },
  customColor: { zh: '自定义颜色', en: 'Custom' },
  colorPreview: { zh: '预览', en: 'Preview' },
  cancel: { zh: '取消', en: 'Cancel' },
  confirm: { zh: '确定', en: 'OK' },
  lineWidth: { zh: '线宽', en: 'Width' },
  lineStyleLabel: { zh: '线型', en: 'Style' },
  lsSolid: { zh: '实线', en: 'Solid' },
  lsDashed: { zh: '虚线', en: 'Dashed' },
  lsDotted: { zh: '点线', en: 'Dotted' },
  opacityLabel: { zh: '透明度', en: 'Opacity' },
  titleGroupStyle: { zh: '组样式（颜色/线宽/线型/透明度）', en: 'Group style (color / width / dash / opacity)' },

  // Select-mode hints
  selectedN: { zh: '已选择 {n} 条波形', en: '{n} segment(s) selected' },
  copiedN: { zh: '已复制 {n} 条线', en: '{n} segment(s) copied' },
  hintDeselect: { zh: '• 点击空白处取消选择', en: '• Click empty space to deselect' },
  hintShiftSelect: { zh: '• Shift+点击 多选', en: '• Shift+click to multi-select' },
  hintCtrlCStart: { zh: '• Ctrl+C 开始复制', en: '• Ctrl+C to start copying' },
  hintCtrlCClip: { zh: '• Ctrl+C 复制线到剪贴板', en: '• Ctrl+C to copy to clipboard' },
  hintClickSelect: { zh: '• 点击线段选中', en: '• Click a segment to select' },
  hintCopyPaste: { zh: '• Ctrl+C 复制 / Ctrl+V 粘贴', en: '• Ctrl+C copy / Ctrl+V paste' },
  hintCtrlVPreview: { zh: '• Ctrl+V 粘贴并预览', en: '• Ctrl+V to paste and preview' },
  hintMoveMouse: { zh: '• 移动鼠标调整位置', en: '• Move the mouse to reposition' },
  pastePreviewMode: { zh: '复制预览模式', en: 'Paste preview' },
  btnCopy: { zh: '复制', en: 'Copy' },
  btnPaste: { zh: '粘贴', en: 'Paste' },
  tipCopy: { zh: '复制选中的波形（先在选择模式下选中）', en: 'Copy the selected segments (select them in Select mode first)' },
  tipPaste: { zh: '粘贴，副本偏移后可拖动调整位置', en: 'Paste; the copy is offset and can be dragged into place' },
  hintClickConfirm: { zh: '• 点击画布确认复制', en: '• Click the canvas to confirm' },
  hintEnterEsc: { zh: '• Enter 确认 / Esc 取消', en: '• Enter to confirm / Esc to cancel' },

  // Tabs
  tabGenerator: { zh: '波形生成', en: 'Generator' },
  tabCalculator: { zh: '波形计算', en: 'Calculator' },

  // Generator
  waveType: { zh: '波形类型', en: 'Waveform type' },
  amplitude: { zh: '幅度', en: 'Amplitude' },
  period: { zh: '周期', en: 'Period' },
  totalCycles: { zh: '总周期数', en: 'Cycles' },
  startTime: { zh: '开始时间', en: 'Start time' },
  dcOffset: { zh: '直流偏置', en: 'DC offset' },
  edgePercent: { zh: '边沿时间占比 (%)', en: 'Edge time (% of period)' },
  edgeHint: { zh: '单个上升/下降沿占周期的百分比', en: 'One rising/falling edge as % of the period' },
  dampingTau: { zh: '衰减时间常数 τ（周期数）', en: 'Decay constant τ (periods)' },
  dampingHint: { zh: '幅度按 e^(-t/τT) 衰减，τ 越大振铃持续越久', en: 'Amplitude decays as e^(-t/τT); larger τ rings longer' },
  rampHint: { zh: '类似电感电流：上升沿占空比，下降沿为剩余时间', en: 'Like inductor current: duty sets the rise, the rest falls' },
  triangleHint: { zh: '50% 为对称三角波，100% 等效锯齿波', en: '50% = symmetric triangle, 100% ≈ sawtooth' },
  enablePhase: { zh: '启用错相功能', en: 'Enable phase interleaving' },
  enableComplementary: { zh: '生成互补波形', en: 'Generate complementary signal' },
  deadTimePercent: { zh: '死区占比 (%)', en: 'Dead time (% of period)' },
  deadTimeHint: { zh: '每个开关沿两管同时为低的时间占周期百分比', en: 'Both signals stay low for this % of the period at each transition' },
  compSuffix: { zh: '_互补', en: '_comp' },
  multiPhaseTitle: { zh: '多相扩展已有组', en: 'Multi-phase extension of a group' },
  multiPhaseHint: { zh: '按 周期/相数 平移生成副本，周期需自行指定', en: 'Creates copies shifted by period/phases; specify the period yourself' },
  extendBtn: { zh: '生成多相副本', en: 'Create phase copies' },
  phaseCount: { zh: '相数', en: 'Phases' },
  phaseDiff: { zh: '相位差: {n}°', en: 'Phase step: {n}°' },
  generate: { zh: '生成波形', en: 'Generate' },
  dutySquare: { zh: '占空比 (%)', en: 'Duty cycle (%)' },
  dutyRamp: { zh: '上升占空比 (%)', en: 'Rise duty (%)' },
  dutyTriangle: { zh: '峰值位置 (%)', en: 'Peak position (%)' },

  // Waveform type labels
  wtSquare: { zh: '方波', en: 'Square' },
  wtRamp: { zh: 'Ramp波（电感电流）', en: 'Ramp (inductor current)' },
  wtSine: { zh: '正弦波', en: 'Sine' },
  wtTriangle: { zh: '三角波（PWM载波）', en: 'Triangle (PWM carrier)' },
  wtSawtooth: { zh: '锯齿波', en: 'Sawtooth' },
  wtTrapezoid: { zh: '梯形波（开关节点）', en: 'Trapezoid (switch node)' },
  wtRectified: { zh: '整流正弦 |sin|', en: 'Rectified sine |sin|' },
  wtDamped: { zh: '阻尼振荡（振铃）', en: 'Damped ringing' },

  // DC/DC waveform bundles
  dcdcTitle: { zh: 'DC/DC 论文波形模板', en: 'DC/DC paper waveform templates' },
  dcdcHint: { zh: '一次生成同一时基下的多条典型波形；数值为归一化示意，可继续编辑。', en: 'Creates aligned, normalized reference waveforms that remain editable.' },
  dcdcGenerate: { zh: '生成模板组', en: 'Generate template bundle' },
  dcdcLlc: { zh: 'LLC 谐振：vHB、iLr、iLm、vCr、iSec', en: 'LLC resonant: vHB, iLr, iLm, vCr, iSec' },
  dcdcDab: { zh: 'DAB：vAB、vCD、iL', en: 'DAB: vAB, vCD, iL' },
  dcdcBuck: { zh: 'Buck：vSW、iL、iC', en: 'Buck: vSW, iL, iC' },
  dcdcBoost: { zh: 'Boost：vSW、iL、iC', en: 'Boost: vSW, iL, iC' },
  dcdcPhaseShift: { zh: '桥间相移 (°)', en: 'Bridge phase shift (°)' },
  dcdcResonantRatio: { zh: '谐振频率 / 开关频率', en: 'Resonant / switching frequency' },

  generatorCategory: { zh: '生成类别', en: 'Generator category' },
  generatorBasic: { zh: '基础波形', en: 'Basic waveforms' },
  generatorDcdc: { zh: 'DC/DC 论文波形模板', en: 'DC/DC paper templates' },


  // Calculator
  calcTitle: { zh: '波形计算器', en: 'Waveform Calculator' },
  calcPlaceholder: { zh: '点击按钮构建算式...', en: 'Build an expression with the buttons...' },
  constPlaceholder: { zh: '常数', en: 'Constant' },
  insertConst: { zh: '插入常数', en: 'Insert constant' },
  clear: { zh: '清空', en: 'Clear' },
  titleRemoveLast: { zh: '删除最后一项', en: 'Remove the last item' },
  selectWaveform: { zh: '选择波形', en: 'Pick a waveform' },
  calcExamples: { zh: '示例：(A + B) × 0.5、A × 2 − 1、V × I（瞬时功率）', en: 'e.g. (A + B) × 0.5, A × 2 − 1, V × I (instantaneous power)' },
  calculate: { zh: '计算', en: 'Compute' },
  errNeedOperator: { zh: '这里应该是运算符', en: 'An operator is expected here' },
  errNeedValue: { zh: '请先放入波形或常数', en: 'Add a waveform or constant first' },
  errBadConst: { zh: '常数无效', en: 'Invalid constant' },
  errNoRparen: { zh: '没有可闭合的括号', en: 'No open parenthesis to close' },
  errNeedGroup: { zh: '表达式需包含至少一个波形', en: 'The expression needs at least one waveform' },
  errUnclosed: { zh: '括号未闭合', en: 'Unclosed parenthesis' },
  errIncomplete: { zh: '表达式不完整', en: 'Incomplete expression' },
  errInvalid: { zh: '表达式无效', en: 'Invalid expression' },
} as const;

export type StringKey = keyof typeof S;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => {
    let text: string = S[key][lang];
    if (vars) {
      for (const k in vars) text = text.replace(`{${k}}`, String(vars[k]));
    }
    return text;
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
