import type { LineSegment, WaveformGroup } from '../types/waveform.ts';

export interface WaveformDeletionResult {
  segments: LineSegment[];
  groups: WaveformGroup[];
  removedGroupIds: string[];
}

export function deleteSegmentsAndEmptyGroups(
  segments: LineSegment[],
  groups: WaveformGroup[],
  segmentIds: ReadonlySet<string>,
): WaveformDeletionResult {
  const affectedGroups = new Set(segments
    .filter(segment => segmentIds.has(segment.id) && segment.groupId)
    .map(segment => segment.groupId as string));
  const nextSegments = segments.filter(segment => !segmentIds.has(segment.id));
  const updatedGroups = groups.map(group => ({
    ...group,
    segments: group.segments.filter(id => !segmentIds.has(id)),
  }));
  const removedGroupIds = updatedGroups
    .filter(group => affectedGroups.has(group.id) && !nextSegments.some(segment => segment.groupId === group.id) && !group.parametric)
    .map(group => group.id);
  const removed = new Set(removedGroupIds);
  return {
    segments: nextSegments,
    groups: updatedGroups.filter(group => !removed.has(group.id)),
    removedGroupIds,
  };
}
