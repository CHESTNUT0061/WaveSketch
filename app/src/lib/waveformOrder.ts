import type { WaveformGroup } from '../types/waveform.ts';

export function reorderGroupList(groups: WaveformGroup[], activeGroupId: string, targetGroupId: string): WaveformGroup[] {
  const fromIndex = groups.findIndex(group => group.id === activeGroupId);
  const toIndex = groups.findIndex(group => group.id === targetGroupId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return groups;
  const next = [...groups];
  const [active] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, active);
  return next;
}

export function groupsBottomToTop(groups: WaveformGroup[]): WaveformGroup[] {
  return [...groups].reverse();
}
