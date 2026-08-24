export interface OverlayPosition {
  x: number;
  y: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface OverlayRect extends OverlayPosition, OverlaySize {}

export interface StoredOverlayPositionV2 extends OverlayPosition {
  version: 2;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const intersects = (position: OverlayPosition, size: OverlaySize, rect: OverlayRect) =>
  position.x < rect.x + rect.width &&
  position.x + size.width > rect.x &&
  position.y < rect.y + rect.height &&
  position.y + size.height > rect.y;

export function constrainOverlayPosition(
  position: OverlayPosition,
  size: OverlaySize,
  bounds: OverlaySize,
  exclusion?: OverlayRect | null,
  margin = 8,
  exclusionGap = 8,
): OverlayPosition {
  const clampToBounds = (candidate: OverlayPosition): OverlayPosition => ({
    x: clamp(candidate.x, margin, bounds.width - margin - size.width),
    y: clamp(candidate.y, margin, bounds.height - margin - size.height),
  });

  const bounded = clampToBounds(position);
  if (!exclusion) return bounded;

  const reserved: OverlayRect = {
    x: exclusion.x - exclusionGap,
    y: exclusion.y - exclusionGap,
    width: exclusion.width + exclusionGap * 2,
    height: exclusion.height + exclusionGap * 2,
  };
  if (!intersects(bounded, size, reserved)) return bounded;

  const candidates = [
    clampToBounds({ x: reserved.x - size.width, y: bounded.y }),
    clampToBounds({ x: reserved.x + reserved.width, y: bounded.y }),
    clampToBounds({ x: bounded.x, y: reserved.y - size.height }),
    clampToBounds({ x: bounded.x, y: reserved.y + reserved.height }),
  ].filter((candidate) => !intersects(candidate, size, reserved));

  if (candidates.length === 0) return bounded;
  return candidates.reduce((nearest, candidate) => {
    const nearestDistance = (nearest.x - bounded.x) ** 2 + (nearest.y - bounded.y) ** 2;
    const candidateDistance = (candidate.x - bounded.x) ** 2 + (candidate.y - bounded.y) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

export function migrateLegacyOverlayPosition(
  stored: unknown,
  bounds: OverlaySize,
  size: OverlaySize,
  inset = 12,
): OverlayPosition | null {
  if (!stored || typeof stored !== 'object') return null;
  const value = stored as Partial<StoredOverlayPositionV2>;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  if (value.version === 2) return { x: value.x as number, y: value.y as number };
  return {
    x: bounds.width - inset - size.width + (value.x as number),
    y: bounds.height - inset - size.height + (value.y as number),
  };
}

export function serializeOverlayPosition(position: OverlayPosition): StoredOverlayPositionV2 {
  return { version: 2, x: position.x, y: position.y };
}
