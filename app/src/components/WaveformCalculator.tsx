import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Trash2, Equal } from 'lucide-react';
import type { WaveformGroup } from '@/types/waveform';

interface WaveformCalculatorProps {
  groups: WaveformGroup[];
  onCalculate: (expression: string, groupIds: string[], operators: ('+' | '-')[]) => void;
}

type Token = { type: 'group'; id: string; name: string } | { type: 'operator'; value: '+' | '-' };

export const WaveformCalculator: React.FC<WaveformCalculatorProps> = ({
  groups,
  onCalculate,
}) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 添加波形到表达式
  const addGroup = (groupId: string, groupName: string) => {
    // 检查是否可以添加（表达式为空或最后一个token是运算符）
    if (tokens.length === 0 || tokens[tokens.length - 1].type === 'operator') {
      setTokens([...tokens, { type: 'group', id: groupId, name: groupName }]);
      setError(null);
    } else {
      setError('请先选择运算符');
    }
  };

  // 添加运算符
  const addOperator = (op: '+' | '-') => {
    // 检查是否可以添加（表达式不为空且最后一个token是波形）
    if (tokens.length > 0 && tokens[tokens.length - 1].type === 'group') {
      setTokens([...tokens, { type: 'operator', value: op }]);
      setError(null);
    } else {
      setError('请先选择波形');
    }
  };

  // 清空表达式
  const clearExpression = () => {
    setTokens([]);
    setError(null);
  };

  // 删除最后一个token
  const removeLastToken = () => {
    setTokens(tokens.slice(0, -1));
    setError(null);
  };

  // 计算表达式
  const calculate = () => {
    // 验证表达式
    if (tokens.length === 0) {
      setError('表达式为空');
      return;
    }

    // 检查是否以运算符结尾
    if (tokens[tokens.length - 1].type === 'operator') {
      setError('表达式不能以运算符结尾');
      return;
    }

    // 至少需要两个波形
    const groupTokens = tokens.filter(t => t.type === 'group');
    if (groupTokens.length < 2) {
      setError('至少需要两个波形进行运算');
      return;
    }

    // 提取波形ID和运算符
    const groupIds: string[] = [];
    const operators: ('+' | '-')[] = [];

    tokens.forEach((token) => {
      if (token.type === 'group') {
        groupIds.push(token.id);
      } else if (token.type === 'operator') {
        operators.push(token.value);
      }
    });

    // 构建表达式字符串
    const expression = tokens.map(t => 
      t.type === 'group' ? t.name : t.value
    ).join(' ');

    onCalculate(expression, groupIds, operators);
    setTokens([]);
    setError(null);
  };

  // 生成表达式显示文本
  const getExpressionText = () => {
    return tokens.map(t => 
      t.type === 'group' ? t.name : t.value
    ).join(' ');
  };

  return (
    <div className="mb-6">
      <Label className="text-sm font-medium mb-2 block">波形计算器</Label>
      
      {/* 表达式显示 */}
      <div className="mb-3 p-2 bg-gray-100 rounded border">
        <div className="text-sm font-mono min-h-[24px] break-all">
          {getExpressionText() || <span className="text-gray-400">点击按钮构建算式...</span>}
        </div>
        {error && (
          <div className="text-xs text-red-500 mt-1">{error}</div>
        )}
      </div>

      {/* 运算符按钮 */}
      <div className="flex gap-2 mb-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => addOperator('+')}
          className="flex-1 text-lg font-bold"
          disabled={tokens.length === 0 || tokens[tokens.length - 1].type === 'operator'}
        >
          +
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => addOperator('-')}
          className="flex-1 text-lg font-bold"
          disabled={tokens.length === 0 || tokens[tokens.length - 1].type === 'operator'}
        >
          −
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={removeLastToken}
          className="px-2"
          disabled={tokens.length === 0}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={clearExpression}
          className="px-2"
          disabled={tokens.length === 0}
        >
          清空
        </Button>
      </div>

      {/* 波形按钮 */}
      <div className="mb-3">
        <Label className="text-xs text-gray-500 mb-1 block">选择波形</Label>
        <div className="flex flex-wrap gap-1">
          {groups.map((group) => (
            <Button
              key={group.id}
              size="sm"
              variant="outline"
              onClick={() => addGroup(group.id, group.name)}
              disabled={tokens.length > 0 && tokens[tokens.length - 1].type === 'group'}
              className="text-xs"
              style={{ 
                borderColor: group.color,
                backgroundColor: tokens.some(t => t.type === 'group' && t.id === group.id) 
                  ? group.color + '20' 
                  : undefined 
              }}
            >
              <div
                className="w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: group.color }}
              />
              {group.name}
            </Button>
          ))}
          {groups.length === 0 && (
            <span className="text-xs text-gray-400">暂无波形组</span>
          )}
        </div>
      </div>

      {/* 计算按钮 */}
      <Button
        size="sm"
        onClick={calculate}
        className="w-full flex items-center gap-1"
        disabled={tokens.length < 3 || tokens[tokens.length - 1].type === 'operator'}
      >
        <Equal className="w-4 h-4" />
        计算
      </Button>
    </div>
  );
};
