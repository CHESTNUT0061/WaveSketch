import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Trash2, 
  Plus,
  Eye,
  EyeOff,
  Copy,
  Edit2,
  Check,
  Calculator,
  Wand2
} from 'lucide-react';
import { WaveformCalculator } from './WaveformCalculator';
import { WaveformGenerator, type WaveformType } from './WaveformGenerator';
import type { WaveformGroup, LineSegment, CalcRpnToken } from '@/types/waveform';

// Color picker component
interface ColorPickerProps {
  currentColor: string;
  onSelect: (color: string) => void;
  onCancel: () => void;
  position: { x: number; y: number };
}

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
];

const ColorPicker: React.FC<ColorPickerProps> = ({ currentColor, onSelect, onCancel, position }) => {
  const [customColor, setCustomColor] = useState(currentColor);
  const [rgb, setRgb] = useState(() => {
    const hex = currentColor.replace('#', '');
    return {
      r: parseInt(hex.substring(0, 2), 16) || 0,
      g: parseInt(hex.substring(2, 4), 16) || 0,
      b: parseInt(hex.substring(4, 6), 16) || 0,
    };
  });

  const hexToRgb = (hex: string) => {
    const cleanHex = hex.replace('#', '');
    return {
      r: parseInt(cleanHex.substring(0, 2), 16) || 0,
      g: parseInt(cleanHex.substring(2, 4), 16) || 0,
      b: parseInt(cleanHex.substring(4, 6), 16) || 0,
    };
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const handleRgbChange = (key: 'r' | 'g' | 'b', value: string) => {
    const num = parseInt(value) || 0;
    const newRgb = { ...rgb, [key]: Math.max(0, Math.min(255, num)) };
    setRgb(newRgb);
    setCustomColor(rgbToHex(newRgb.r, newRgb.g, newRgb.b));
  };

  const handleHexChange = (value: string) => {
    let hex = value;
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-Fa-f]{0,6}$/.test(hex)) {
      setCustomColor(hex);
      setRgb(hexToRgb(hex));
    }
  };

  return (
    <div 
      className="fixed z-[100] p-3 bg-white rounded-lg shadow-xl border border-gray-200 w-56"
      style={{ 
        left: position.x, 
        top: position.y
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Preset colors */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-2">预设颜色</div>
        <div className="grid grid-cols-5 gap-1">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              className={`w-7 h-7 rounded-full border-2 ${customColor === color ? 'border-gray-800' : 'border-gray-200'}`}
              style={{ backgroundColor: color }}
              onClick={() => {
                setCustomColor(color);
                setRgb(hexToRgb(color));
              }}
            />
          ))}
        </div>
      </div>

      {/* Custom color */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-2">自定义颜色</div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              setRgb(hexToRgb(e.target.value));
            }}
            className="w-10 h-8 rounded cursor-pointer"
          />
          <Input
            value={customColor}
            onChange={(e) => handleHexChange(e.target.value)}
            className="h-8 text-xs flex-1"
            placeholder="#RRGGBB"
          />
        </div>
      </div>

      {/* RGB inputs */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-2">RGB</div>
        <div className="flex gap-1">
          <div className="flex-1">
            <Input
              type="number"
              min="0"
              max="255"
              value={rgb.r}
              onChange={(e) => handleRgbChange('r', e.target.value)}
              className="h-7 text-xs px-1"
            />
            <div className="text-[10px] text-center text-gray-400">R</div>
          </div>
          <div className="flex-1">
            <Input
              type="number"
              min="0"
              max="255"
              value={rgb.g}
              onChange={(e) => handleRgbChange('g', e.target.value)}
              className="h-7 text-xs px-1"
            />
            <div className="text-[10px] text-center text-gray-400">G</div>
          </div>
          <div className="flex-1">
            <Input
              type="number"
              min="0"
              max="255"
              value={rgb.b}
              onChange={(e) => handleRgbChange('b', e.target.value)}
              className="h-7 text-xs px-1"
            />
            <div className="text-[10px] text-center text-gray-400">B</div>
          </div>
        </div>
      </div>

      {/* Preview and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div 
            className="w-6 h-6 rounded-full border border-gray-300"
            style={{ backgroundColor: customColor }}
          />
          <span className="text-xs text-gray-500">预览</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" className="h-7 px-2 text-xs" onClick={() => onSelect(customColor)}>
            确定
          </Button>
        </div>
      </div>
    </div>
  );
};

interface ToolbarProps {
  groups: WaveformGroup[];
  selectedGroup: string | null;
  onCreateGroup: (name: string) => void;
  onDeleteGroup: (id: string) => void;
  onToggleGroupVisibility: (id: string) => void;
  onSelectGroup: (id: string | null) => void;
  onCalculateWaveforms: (expression: string, rpn: CalcRpnToken[]) => void;
  onClearAll: () => void;
  onDuplicateGroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, newName: string) => void;
  onChangeGroupColor: (groupId: string, color: string) => void;
  selectedSegments: Set<string>;
  onGenerateWaveform: (
    type: WaveformType,
    params: {
      amplitude: number;
      period: number;
      dutyCycle: number;
      totalCycles: number;
      startTime: number;
      phaseShift: number;
      offset?: number;
      edgePercent?: number;
      dampingTau?: number;
    },
    groupName: string,
    customColor?: string
  ) => void;
  // Select-mode props
  mode?: string;
  isCopyPreview?: boolean;
  clipboardSegments?: LineSegment[];
}

type TabType = 'generator' | 'calculator';

export const Toolbar: React.FC<ToolbarProps> = ({
  groups,
  selectedGroup,
  onCreateGroup,
  onDeleteGroup,
  onToggleGroupVisibility,
  onSelectGroup,
  onCalculateWaveforms,
  onClearAll,
  onDuplicateGroup,
  onRenameGroup,
  onChangeGroupColor,
  selectedSegments,
  onGenerateWaveform,
  mode = 'draw',
  isCopyPreview = false,
  clipboardSegments = [],
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [colorPickerGroup, setColorPickerGroup] = useState<string | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<TabType>('generator');

  const handleOpenColorPicker = (groupId: string, e: React.MouseEvent) => {
    setColorPickerGroup(groupId);
    setColorPickerPos({ x: e.clientX, y: e.clientY });
  };

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      onCreateGroup(newGroupName.trim());
      setNewGroupName('');
    }
  };

  return (
    <div className="w-full bg-gray-50 p-4 rounded-lg border border-gray-200 overflow-y-auto h-full">
      {/* Title */}
      <h2 className="text-lg font-bold text-gray-800 mb-4">波形组管理</h2>
      
      {/* Waveform group management */}
      <div className="mb-4">
        <Label className="text-sm font-medium mb-2 block">波形组</Label>
        <div className="flex gap-2 mb-2">
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="新组名称"
            className="h-8 flex-1"
          />
          <Button size="sm" onClick={handleCreateGroup} className="px-2">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2 bg-white mb-2">
          {groups.length === 0 && (
            <div className="text-xs text-gray-400 text-center py-2">暂无波形组</div>
          )}
          {groups.map((group) => (
            <div
              key={group.id}
              className={`flex items-center justify-between p-2 rounded text-sm ${
                selectedGroup === group.id ? 'bg-blue-100' : 'hover:bg-gray-50'
              }`}
              onClick={() => onSelectGroup(group.id === selectedGroup ? null : group.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                {editingGroup === group.id ? (
                  <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-6 text-xs py-0 px-1 flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onRenameGroup(group.id, editName);
                          setEditingGroup(null);
                        } else if (e.key === 'Escape') {
                          setEditingGroup(null);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRenameGroup(group.id, editName);
                        setEditingGroup(null);
                      }}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <span 
                    className={`truncate ${!group.visible ? 'text-gray-400' : ''}`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingGroup(group.id);
                      setEditName(group.name);
                    }}
                    title="双击重命名"
                  >
                    {group.name} ({group.segments.length})
                  </span>
                )}
              </div>
              <div className="flex gap-1 items-center">
                {/* Color picker */}
                {colorPickerGroup === group.id ? (
                  <ColorPicker 
                    currentColor={group.color}
                    onSelect={(color) => {
                      onChangeGroupColor(group.id, color);
                      setColorPickerGroup(null);
                    }}
                    onCancel={() => setColorPickerGroup(null)}
                    position={colorPickerPos}
                  />
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenColorPicker(group.id, e);
                    }}
                    title="修改颜色"
                  >
                    <div 
                      className="w-3 h-3 rounded-full border border-gray-300"
                      style={{ backgroundColor: group.color }}
                    />
                  </Button>
                )}
                {editingGroup !== group.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingGroup(group.id);
                      setEditName(group.name);
                    }}
                    title="重命名"
                  >
                    <Edit2 className="w-3 h-3" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicateGroup(group.id);
                  }}
                  title="复制组"
                >
                  <Copy className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleGroupVisibility(group.id);
                  }}
                >
                  {group.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-red-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGroup(group.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        
        {/* Clear all */}
        <Button
          variant="destructive"
          size="sm"
          onClick={onClearAll}
          className="w-full"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          清空所有
        </Button>
      </div>

      {/* Select mode - selection status and hints */}
      {mode === 'select' && (
        <div className="mb-4">
          {/* Selection status */}
          {selectedSegments.size > 0 && !isCopyPreview && (
            <div className="p-3 bg-blue-50 rounded mb-2">
              <div className="text-sm font-medium mb-2 text-blue-800">
                已选择 {selectedSegments.size} 条波形
              </div>
              <div className="text-xs text-blue-600 space-y-1">
                <div>• 点击空白处取消选择</div>
                <div>• Shift+点击 多选</div>
                <div>• Ctrl+C 开始复制</div>
              </div>
            </div>
          )}
          
          {/* Selected but not yet copied */}
          {selectedSegments.size > 0 && clipboardSegments.length === 0 && !isCopyPreview && (
            <div className="p-3 bg-blue-50 rounded mb-2">
              <div className="text-xs text-blue-600 space-y-1">
                <div>• Ctrl+C 复制线到剪贴板</div>
                <div>• 点击空白处取消选择</div>
              </div>
            </div>
          )}
          
          {/* Copied to clipboard, not yet pasted */}
          {clipboardSegments.length > 0 && !isCopyPreview && (
            <div className="p-3 bg-indigo-50 rounded mb-2">
              <div className="text-sm font-medium mb-1 text-indigo-800">
                已复制 {clipboardSegments.length} 条线
              </div>
              <div className="text-xs text-indigo-600 space-y-1">
                <div>• Ctrl+V 粘贴并预览</div>
                <div>• 移动鼠标调整位置</div>
              </div>
            </div>
          )}
          
          {/* Hints when nothing is selected */}
          {selectedSegments.size === 0 && clipboardSegments.length === 0 && !isCopyPreview && (
            <div className="p-3 bg-gray-50 rounded mb-2">
              <div className="text-xs text-gray-500 space-y-1">
                <div>• 点击线段选中</div>
                <div>• Shift+点击 多选</div>
                <div>• Ctrl+C 复制 / Ctrl+V 粘贴</div>
              </div>
            </div>
          )}
          
          {/* Paste preview status */}
          {isCopyPreview && (
            <div className="p-3 bg-green-50 rounded border border-green-200">
              <div className="text-sm font-medium mb-2 text-green-800">
                复制预览模式
              </div>
              <div className="text-xs text-green-600 space-y-1">
                <div>• 移动鼠标调整位置</div>
                <div>• 点击画布确认复制</div>
                <div>• Enter 确认 / Esc 取消</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab switcher */}
      <div className="mb-3">
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-1 ${
              activeTab === 'generator'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('generator')}
          >
            <Wand2 className="w-4 h-4" />
            波形生成
          </button>
          <button
            className={`flex-1 py-2 px-3 text-sm font-medium flex items-center justify-center gap-1 ${
              activeTab === 'calculator'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab('calculator')}
          >
            <Calculator className="w-4 h-4" />
            波形计算
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="mb-4">
        {activeTab === 'generator' && (
          <WaveformGenerator onGenerate={onGenerateWaveform} />
        )}
        {activeTab === 'calculator' && (
          <WaveformCalculator groups={groups} onCalculate={onCalculateWaveforms} />
        )}
      </div>
    </div>
  );
};