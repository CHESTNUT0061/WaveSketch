import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Equal } from 'lucide-react';
import type { WaveformGroup, CalcTerm } from '@/types/waveform';

interface WaveformCalculatorProps {
  groups: WaveformGroup[];
  onCalculate: (expression: string, terms: CalcTerm[], operators: ('+' | '-')[]) => void;
}

type Token =
  | { type: 'group'; id: string; name: string }
  | { type: 'operator'; value: '+' | '-' }
  | { type: 'scale'; value: number }; // ×常数，紧跟在波形后面

export const WaveformCalculator: React.FC<WaveformCalculatorProps> = ({
  groups,
  onCalculate,
}) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scaleInput, setScaleInput] = useState('2');

  const lastToken = tokens[tokens.length - 1];
  // 一项结束的位置（波形本身，或波形×常数之后）
  const lastIsTermEnd = !!lastToken && (lastToken.type === 'group' || lastToken.type === 'scale');

  // 添加波形到表达式
  const addGroup = (groupId: string, groupName: string) => {
    // 检查是否可以添加（表达式为空或最后一个token是运算符）
    if (tokens.length === 0 || lastToken?.type === 'operator') {
      setTokens([...tokens, { type: 'group', id: groupId, name: groupName }]);
      setError(null);
    } else {
      setError('请先选择运算符');
    }
  };

  // 添加运算符
  const addOperator = (op: '+' | '-') => {
    // 检查是否可以添加（最后一个token是波形或×常数）
    if (lastIsTermEnd) {
      setTokens([...tokens, { type: 'operator', value: op }]);
      setError(null);
    } else {
      setError('请先选择波形');
    }
  };

  // 添加×常数（只能紧跟在波形后面，一项只允许一个系数）
  const addScale = () => {
    if (!lastToken || lastToken.type !== 'group') {
      setError('×常数需要紧跟在波形后面');
      return;
    }
    const k = parseFloat(scaleInput);
    if (!Number.isFinite(k)) {
      setError('常数无效');
      return;
    }
    setTokens([...tokens, { type: 'scale', value: k }]);
    setError(null);
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

  // token序列 → 显示文本
  const tokenText = (t: Token) =>
    t.type === 'group' ? t.name : t.type === 'scale' ? `× ${t.value}` : t.value;

  // 表达式是否可计算：至少两个波形，或单个波形带×常数
  const groupCount = tokens.filter(t => t.type === 'group').length;
  const hasScale = tokens.some(t => t.type === 'scale');
  const canCalculate = lastIsTermEnd && (groupCount >= 2 || (groupCount === 1 && hasScale));

  // 计算表达式
  const calculate = () => {
    // 验证表达式
    if (tokens.length === 0) {
      setError('表达式为空');
      return;
    }

    if (lastToken?.type === 'operator') {
      setError('表达式不能以运算符结尾');
      return;
    }

    if (!canCalculate) {
      setError('需要两个波形运算，或单个波形×常数');
      return;
    }

    // 提取项（波形×系数）和运算符
    const terms: CalcTerm[] = [];
    const operators: ('+' | '-')[] = [];

    tokens.forEach((token) => {
      if (token.type === 'group') {
        terms.push({ groupId: token.id, scale: 1 });
      } else if (token.type === 'scale') {
        terms[terms.length - 1].scale = token.value;
      } else {
        operators.push(token.value);
      }
    });

    // 构建表达式字符串
    const expression = tokens.map(tokenText).join(' ');

    onCalculate(expression, terms, operators);
    setTokens([]);
    setError(null);
  };

  // 生成表达式显示文本
  const getExpressionText = () => {
    return tokens.map(tokenText).join(' ');
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
      <div className="flex gap-2 mb-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => addOperator('+')}
          className="flex-1 text-lg font-bold"
          disabled={!lastIsTermEnd}
        >
          +
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => addOperator('-')}
          className="flex-1 text-lg font-bold"
          disabled={!lastIsTermEnd}
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

      {/* ×常数（增益缩放） */}
      <div className="flex gap-2 mb-3 items-center">
        <Button
          size="sm"
          variant="outline"
          onClick={addScale}
          className="text-lg font-bold px-3"
          disabled={!lastToken || lastToken.type !== 'group'}
          title="将上一个波形乘以常数（增益缩放，可为负数）"
        >
          ×
        </Button>
        <Input
          type="number"
          step="0.1"
          value={scaleInput}
          onChange={(e) => setScaleInput(e.target.value)}
          className="h-8 flex-1 text-sm"
          placeholder="常数"
        />
        <span className="text-xs text-gray-400 whitespace-nowrap">增益系数</span>
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
              disabled={lastIsTermEnd}
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
        disabled={!canCalculate}
      >
        <Equal className="w-4 h-4" />
        计算
      </Button>
    </div>
  );
};
