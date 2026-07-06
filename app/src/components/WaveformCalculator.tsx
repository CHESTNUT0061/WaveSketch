import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trash2, Equal } from 'lucide-react';
import type { WaveformGroup, CalcRpnToken } from '@/types/waveform';
import { useI18n } from '@/i18n';

interface WaveformCalculatorProps {
  groups: WaveformGroup[];
  onCalculate: (expression: string, rpn: CalcRpnToken[]) => void;
}

type Token =
  | { type: 'group'; id: string; name: string }
  | { type: 'const'; value: number }
  | { type: 'op'; value: '+' | '-' | '×' }
  | { type: 'lparen' }
  | { type: 'rparen' };

const tokenText = (t: Token): string => {
  switch (t.type) {
    case 'group': return t.name;
    case 'const': return String(t.value);
    case 'op': return t.value;
    case 'lparen': return '(';
    case 'rparen': return ')';
  }
};

// A value ends here: an operator / right paren may follow a group, constant, or right paren
const isValueEnd = (t: Token | undefined) =>
  !!t && (t.type === 'group' || t.type === 'const' || t.type === 'rparen');

// A value may start here: at the beginning, after an operator, or after a left paren
const isValueStart = (t: Token | undefined) =>
  !t || t.type === 'op' || t.type === 'lparen';

export const WaveformCalculator: React.FC<WaveformCalculatorProps> = ({
  groups,
  onCalculate,
}) => {
  const { t } = useI18n();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [constInput, setConstInput] = useState('1');

  const lastToken = tokens[tokens.length - 1];
  const openParens = tokens.reduce((n, t) => n + (t.type === 'lparen' ? 1 : t.type === 'rparen' ? -1 : 0), 0);

  const canAddValue = isValueStart(lastToken);
  const canAddOp = isValueEnd(lastToken);
  const canAddRparen = isValueEnd(lastToken) && openParens > 0;
  const hasGroup = tokens.some(t => t.type === 'group');
  const canCalculate = tokens.length > 0 && isValueEnd(lastToken) && openParens === 0 && hasGroup;

  const push = (t: Token) => { setTokens([...tokens, t]); setError(null); };

  const addGroup = (groupId: string, groupName: string) => {
    if (!canAddValue) { setError(t('errNeedOperator')); return; }
    push({ type: 'group', id: groupId, name: groupName });
  };

  const addConst = () => {
    if (!canAddValue) { setError(t('errNeedOperator')); return; }
    const v = parseFloat(constInput);
    if (!Number.isFinite(v)) { setError(t('errBadConst')); return; }
    push({ type: 'const', value: v });
  };

  const addOp = (op: '+' | '-' | '×') => {
    if (!canAddOp) { setError(t('errNeedValue')); return; }
    push({ type: 'op', value: op });
  };

  const clearExpression = () => { setTokens([]); setError(null); };
  const removeLastToken = () => { setTokens(tokens.slice(0, -1)); setError(null); };

  // Shunting-yard: infix token list -> RPN
  const toRpn = (): CalcRpnToken[] | null => {
    const output: CalcRpnToken[] = [];
    const opStack: ('+' | '-' | '×' | '(')[] = [];
    const prec = (op: string) => (op === '×' ? 2 : 1);

    for (const t of tokens) {
      if (t.type === 'group') {
        output.push({ t: 'g', id: t.id });
      } else if (t.type === 'const') {
        output.push({ t: 'c', v: t.value });
      } else if (t.type === 'op') {
        while (opStack.length > 0) {
          const top = opStack[opStack.length - 1];
          if (top !== '(' && prec(top) >= prec(t.value)) {
            output.push({ t: 'op', v: opStack.pop() as '+' | '-' | '×' });
          } else break;
        }
        opStack.push(t.value);
      } else if (t.type === 'lparen') {
        opStack.push('(');
      } else {
        // rparen
        while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
          output.push({ t: 'op', v: opStack.pop() as '+' | '-' | '×' });
        }
        if (opStack.pop() !== '(') return null; // unbalanced parentheses
      }
    }
    while (opStack.length > 0) {
      const op = opStack.pop()!;
      if (op === '(') return null;
      output.push({ t: 'op', v: op });
    }
    return output;
  };

  const calculate = () => {
    if (!canCalculate) {
      setError(!hasGroup ? t('errNeedGroup') : openParens > 0 ? t('errUnclosed') : t('errIncomplete'));
      return;
    }
    const rpn = toRpn();
    if (!rpn) { setError(t('errInvalid')); return; }

    const expression = tokens.map(tokenText).join(' ');
    onCalculate(expression, rpn);
    setTokens([]);
    setError(null);
  };

  return (
    <div className="mb-6">
      <Label className="text-sm font-medium mb-2 block">{t('calcTitle')}</Label>

      {/* Expression display */}
      <div className="mb-3 p-2 bg-gray-100 rounded border">
        <div className="text-sm font-mono min-h-[24px] break-all">
          {tokens.length > 0 ? tokens.map(tokenText).join(' ') : <span className="text-gray-400">{t('calcPlaceholder')}</span>}
        </div>
        {error && (
          <div className="text-xs text-red-500 mt-1">{error}</div>
        )}
      </div>

      {/* Operators and parentheses */}
      <div className="flex gap-1 mb-2">
        <Button size="sm" variant="outline" onClick={() => addOp('+')} className="flex-1 text-base font-bold px-0" disabled={!canAddOp}>+</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('-')} className="flex-1 text-base font-bold px-0" disabled={!canAddOp}>−</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('×')} className="flex-1 text-base font-bold px-0" disabled={!canAddOp}>×</Button>
        <Button size="sm" variant="outline" onClick={() => { if (canAddValue) push({ type: 'lparen' }); else setError(t('errNeedOperator')); }} className="flex-1 text-base font-bold px-0" disabled={!canAddValue}>(</Button>
        <Button size="sm" variant="outline" onClick={() => { if (canAddRparen) push({ type: 'rparen' }); else setError(t('errNoRparen')); }} className="flex-1 text-base font-bold px-0" disabled={!canAddRparen}>)</Button>
      </div>

      {/* Constant input and editing */}
      <div className="flex gap-2 mb-3 items-center">
        <Input
          type="number"
          step="0.1"
          value={constInput}
          onChange={(e) => setConstInput(e.target.value)}
          className="h-8 flex-1 text-sm"
          placeholder={t('constPlaceholder')}
        />
        <Button size="sm" variant="outline" onClick={addConst} disabled={!canAddValue} className="text-xs">
          {t('insertConst')}
        </Button>
        <Button size="sm" variant="ghost" onClick={removeLastToken} className="px-2" disabled={tokens.length === 0} title={t('titleRemoveLast')}>
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={clearExpression} className="px-2" disabled={tokens.length === 0}>
          {t('clear')}
        </Button>
      </div>

      {/* Waveform buttons */}
      <div className="mb-3">
        <Label className="text-xs text-gray-500 mb-1 block">{t('selectWaveform')}</Label>
        <div className="flex flex-wrap gap-1">
          {groups.map((group) => (
            <Button
              key={group.id}
              size="sm"
              variant="outline"
              onClick={() => addGroup(group.id, group.name)}
              disabled={!canAddValue}
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
            <span className="text-xs text-gray-400">{t('noGroups')}</span>
          )}
        </div>
      </div>

      {/* Examples */}
      <div className="mb-3 text-xs text-gray-400">
        {t('calcExamples')}
      </div>

      {/* Calculate button */}
      <Button
        size="sm"
        onClick={calculate}
        className="w-full flex items-center gap-1"
        disabled={!canCalculate}
      >
        <Equal className="w-4 h-4" />
        {t('calculate')}
      </Button>
    </div>
  );
};
