import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Equal, Trash2 } from 'lucide-react';
import type { CalcRpnToken, LineSegment, LogicOperator, LogicRpnToken, WaveformGroup } from '@/types/waveform';
import { analyzeDigitalWaveform } from '@/lib/digitalLogic';
import { useI18n, type StringKey } from '@/i18n';

interface WaveformCalculatorProps {
  groups: WaveformGroup[];
  segments: LineSegment[];
  onCalculate: (expression: string, rpn: CalcRpnToken[]) => void;
  onCalculateLogic: (expression: string, rpn: LogicRpnToken[]) => void;
}

type ArithmeticToken =
  | { type: 'group'; id: string; name: string }
  | { type: 'const'; value: number }
  | { type: 'op'; value: '+' | '-' | '×' }
  | { type: 'lparen' }
  | { type: 'rparen' };

type LogicToken =
  | { type: 'group'; id: string; name: string }
  | { type: 'op'; value: LogicOperator }
  | { type: 'lparen' }
  | { type: 'rparen' };

const arithmeticText = (token: ArithmeticToken): string => token.type === 'group' ? token.name
  : token.type === 'const' ? String(token.value)
  : token.type === 'op' ? token.value
  : token.type === 'lparen' ? '(' : ')';

const logicText = (token: LogicToken): string => token.type === 'group' ? token.name
  : token.type === 'op' ? token.value
  : token.type === 'lparen' ? '(' : ')';

const arithmeticEndsValue = (token: ArithmeticToken | undefined) =>
  !!token && (token.type === 'group' || token.type === 'const' || token.type === 'rparen');
const arithmeticStartsValue = (token: ArithmeticToken | undefined) =>
  !token || token.type === 'op' || token.type === 'lparen';
const logicEndsValue = (token: LogicToken | undefined) =>
  !!token && (token.type === 'group' || token.type === 'rparen');
const logicStartsValue = (token: LogicToken | undefined) =>
  !token || token.type === 'lparen' || token.type === 'op';

const ISSUE_KEYS: Record<string, StringKey> = {
  empty: 'logicIssueEmpty',
  parametric: 'logicIssueParametric',
  curve: 'logicIssueCurve',
  diagonal: 'logicIssueDiagonal',
  levels: 'logicIssueLevels',
  disconnected: 'logicIssueDisconnected',
  time: 'logicIssueTime',
};

export const WaveformCalculator: React.FC<WaveformCalculatorProps> = ({
  groups,
  segments,
  onCalculate,
  onCalculateLogic,
}) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'arithmetic' | 'logic'>('arithmetic');
  const [arithmeticTokens, setArithmeticTokens] = useState<ArithmeticToken[]>([]);
  const [logicTokens, setLogicTokens] = useState<LogicToken[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [constInput, setConstInput] = useState('1');
  const analyses = useMemo(() => new Map(groups.map(group => [group.id, analyzeDigitalWaveform(group, segments)])), [groups, segments]);

  const tokens = mode === 'arithmetic' ? arithmeticTokens : logicTokens;
  const last = tokens[tokens.length - 1];
  const openParens = tokens.reduce((count, token) => count + (token.type === 'lparen' ? 1 : token.type === 'rparen' ? -1 : 0), 0);
  const hasGroup = tokens.some(token => token.type === 'group');
  const canAddValue = mode === 'arithmetic'
    ? arithmeticStartsValue(last as ArithmeticToken | undefined)
    : logicStartsValue(last as LogicToken | undefined);
  const canAddBinary = mode === 'arithmetic'
    ? arithmeticEndsValue(last as ArithmeticToken | undefined)
    : logicEndsValue(last as LogicToken | undefined);
  const canCloseParen = canAddBinary && openParens > 0;
  const canCalculate = tokens.length > 0 && canAddBinary && openParens === 0 && hasGroup;

  const clear = () => {
    if (mode === 'arithmetic') setArithmeticTokens([]); else setLogicTokens([]);
    setError(null);
  };
  const removeLast = () => {
    if (mode === 'arithmetic') setArithmeticTokens(previous => previous.slice(0, -1));
    else setLogicTokens(previous => previous.slice(0, -1));
    setError(null);
  };
  const addGroup = (group: WaveformGroup) => {
    if (!canAddValue) return setError(t('errNeedOperator'));
    if (mode === 'arithmetic') setArithmeticTokens(previous => [...previous, { type: 'group', id: group.id, name: group.name }]);
    else setLogicTokens(previous => [...previous, { type: 'group', id: group.id, name: group.name }]);
    setError(null);
  };
  const addParenthesis = (side: 'left' | 'right') => {
    if (side === 'left' && !canAddValue) return setError(t('errNeedOperator'));
    if (side === 'right' && !canCloseParen) return setError(t('errNoRparen'));
    const token = { type: side === 'left' ? 'lparen' : 'rparen' } as const;
    if (mode === 'arithmetic') setArithmeticTokens(previous => [...previous, token]);
    else setLogicTokens(previous => [...previous, token]);
    setError(null);
  };

  const arithmeticRpn = (): CalcRpnToken[] | null => {
    const output: CalcRpnToken[] = [];
    const stack: ('+' | '-' | '×' | '(')[] = [];
    const precedence = (operator: string) => operator === '×' ? 2 : 1;
    for (const token of arithmeticTokens) {
      if (token.type === 'group') output.push({ t: 'g', id: token.id });
      else if (token.type === 'const') output.push({ t: 'c', v: token.value });
      else if (token.type === 'op') {
        while (stack.length && stack[stack.length - 1] !== '(' && precedence(stack[stack.length - 1]) >= precedence(token.value)) {
          output.push({ t: 'op', v: stack.pop() as '+' | '-' | '×' });
        }
        stack.push(token.value);
      } else if (token.type === 'lparen') stack.push('(');
      else {
        while (stack.length && stack[stack.length - 1] !== '(') output.push({ t: 'op', v: stack.pop() as '+' | '-' | '×' });
        if (stack.pop() !== '(') return null;
      }
    }
    while (stack.length) {
      const operator = stack.pop()!;
      if (operator === '(') return null;
      output.push({ t: 'op', v: operator });
    }
    return output;
  };

  const logicRpn = (): LogicRpnToken[] | null => {
    const output: LogicRpnToken[] = [];
    const stack: (LogicOperator | '(')[] = [];
    const precedence = (operator: LogicOperator) => operator === 'NOT' ? 3 : operator === 'AND' ? 2 : 1;
    for (const token of logicTokens) {
      if (token.type === 'group') output.push({ t: 'g', id: token.id });
      else if (token.type === 'op') {
        const isRightAssociative = token.value === 'NOT';
        while (stack.length && stack[stack.length - 1] !== '(') {
          const top = stack[stack.length - 1] as LogicOperator;
          if (precedence(top) > precedence(token.value) || (!isRightAssociative && precedence(top) === precedence(token.value))) {
            output.push({ t: 'op', v: stack.pop() as LogicOperator });
          } else break;
        }
        stack.push(token.value);
      } else if (token.type === 'lparen') stack.push('(');
      else {
        while (stack.length && stack[stack.length - 1] !== '(') output.push({ t: 'op', v: stack.pop() as LogicOperator });
        if (stack.pop() !== '(') return null;
      }
    }
    while (stack.length) {
      const operator = stack.pop()!;
      if (operator === '(') return null;
      output.push({ t: 'op', v: operator });
    }
    return output;
  };

  const calculate = () => {
    if (!canCalculate) return setError(!hasGroup ? t('errNeedGroup') : openParens ? t('errUnclosed') : t('errIncomplete'));
    if (mode === 'arithmetic') {
      const rpn = arithmeticRpn();
      if (!rpn) return setError(t('errInvalid'));
      onCalculate(arithmeticTokens.map(arithmeticText).join(' '), rpn);
      setArithmeticTokens([]);
    } else {
      const referenced = logicTokens.filter((token): token is Extract<LogicToken, { type: 'group' }> => token.type === 'group');
      const invalid = referenced.find(token => !analyses.get(token.id)?.eligible);
      if (invalid) return setError(t('logicInvalidGroup', { name: invalid.name }));
      const rpn = logicRpn();
      if (!rpn) return setError(t('errInvalid'));
      onCalculateLogic(logicTokens.map(logicText).join(' '), rpn);
      setLogicTokens([]);
    }
    setError(null);
  };

  return (
    <div className="mb-6">
      <Label className="text-sm font-medium mb-2 block">{t('calcTitle')}</Label>
      <div className="grid grid-cols-2 mb-3 rounded border overflow-hidden">
        <button className={`py-1.5 text-xs ${mode === 'arithmetic' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`} onClick={() => { setMode('arithmetic'); setError(null); }}>{t('calcArithmetic')}</button>
        <button className={`py-1.5 text-xs ${mode === 'logic' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'}`} onClick={() => { setMode('logic'); setError(null); }}>{t('calcLogic')}</button>
      </div>

      <div className="mb-3 p-2 bg-gray-100 rounded border">
        <div className="text-sm font-mono min-h-[24px] break-all">
          {tokens.length ? tokens.map(token => mode === 'arithmetic' ? arithmeticText(token as ArithmeticToken) : logicText(token as LogicToken)).join(' ') : <span className="text-gray-400">{t('calcPlaceholder')}</span>}
        </div>
        {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
      </div>

      {mode === 'arithmetic' ? (
        <div className="flex gap-1 mb-2">
          {(['+', '-', '×'] as const).map(operator => <Button key={operator} size="sm" variant="outline" className="flex-1 font-bold px-0" disabled={!canAddBinary} onClick={() => setArithmeticTokens(previous => [...previous, { type: 'op', value: operator }])}>{operator}</Button>)}
          <Button size="sm" variant="outline" className="flex-1 px-0" disabled={!canAddValue} onClick={() => addParenthesis('left')}>(</Button>
          <Button size="sm" variant="outline" className="flex-1 px-0" disabled={!canCloseParen} onClick={() => addParenthesis('right')}>)</Button>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-1 mb-2">
          <Button size="sm" variant="outline" className="text-xs px-1" disabled={!canAddValue} onClick={() => setLogicTokens(previous => [...previous, { type: 'op', value: 'NOT' }])}>NOT</Button>
          {(['AND', 'OR'] as const).map(operator => <Button key={operator} size="sm" variant="outline" className="text-xs px-1" disabled={!canAddBinary} onClick={() => setLogicTokens(previous => [...previous, { type: 'op', value: operator }])}>{operator}</Button>)}
          <Button size="sm" variant="outline" className="px-1" disabled={!canAddValue} onClick={() => addParenthesis('left')}>(</Button>
          <Button size="sm" variant="outline" className="px-1" disabled={!canCloseParen} onClick={() => addParenthesis('right')}>)</Button>
        </div>
      )}

      {mode === 'arithmetic' && (
        <div className="flex gap-2 mb-3 items-center">
          <Input type="number" step="0.1" value={constInput} onChange={event => setConstInput(event.target.value)} className="h-8 flex-1 text-sm" placeholder={t('constPlaceholder')} />
          <Button size="sm" variant="outline" disabled={!canAddValue} className="text-xs" onClick={() => {
            const value = Number.parseFloat(constInput);
            if (!Number.isFinite(value)) return setError(t('errBadConst'));
            setArithmeticTokens(previous => [...previous, { type: 'const', value }]); setError(null);
          }}>{t('insertConst')}</Button>
        </div>
      )}

      <div className="mb-3">
        <Label className="text-xs text-gray-500 mb-1 block">{t('selectWaveform')}</Label>
        <div className="flex flex-wrap gap-1">
          {groups.map(group => {
            const analysis = analyses.get(group.id);
            const disabled = !canAddValue || (mode === 'logic' && !analysis?.eligible);
            const issue = analysis?.issue ? t(ISSUE_KEYS[analysis.issue]) : '';
            return <Button key={group.id} size="sm" variant="outline" disabled={disabled} title={mode === 'logic' && !analysis?.eligible ? issue : undefined} onClick={() => addGroup(group)} className="text-xs" style={{ borderColor: group.color }}>
              <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: group.color }} />{group.name}
            </Button>;
          })}
          {!groups.length && <span className="text-xs text-gray-400">{t('noGroups')}</span>}
        </div>
        {mode === 'logic' && <div className="text-[11px] text-gray-400 mt-2">{t('logicEligibilityHint')}</div>}
      </div>

      <div className="flex gap-1 mb-3">
        <Button size="sm" variant="ghost" onClick={removeLast} className="px-2" disabled={!tokens.length} title={t('titleRemoveLast')}><Trash2 className="w-4 h-4" /></Button>
        <Button size="sm" variant="ghost" onClick={clear} disabled={!tokens.length}>{t('clear')}</Button>
      </div>
      <Button size="sm" onClick={calculate} className="w-full flex items-center gap-1" disabled={!canCalculate}><Equal className="w-4 h-4" />{t('calculate')}</Button>
    </div>
  );
};
