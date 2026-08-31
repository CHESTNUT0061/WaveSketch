import type { AxisConfig } from '@/types/waveform';

export const MIN_GRID_SIZE = 0.001;

export const DEFAULT_AXIS_CONFIG: AxisConfig = {
  xUnit: 'us',
  yUnit: 'A',
  xGridSize: 0.5,
  yGridSize: 0.5,
  xMajorGridSize: 2,
  yMajorGridSize: 2,
};

const normalizeGridSize = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? Math.max(MIN_GRID_SIZE, value as number) : fallback;

export const normalizeAxisConfig = (config?: Partial<AxisConfig>): AxisConfig => ({
  xUnit: config?.xUnit ?? DEFAULT_AXIS_CONFIG.xUnit,
  yUnit: config?.yUnit ?? DEFAULT_AXIS_CONFIG.yUnit,
  xGridSize: normalizeGridSize(config?.xGridSize, DEFAULT_AXIS_CONFIG.xGridSize),
  yGridSize: normalizeGridSize(config?.yGridSize, DEFAULT_AXIS_CONFIG.yGridSize),
  xMajorGridSize: normalizeGridSize(config?.xMajorGridSize, DEFAULT_AXIS_CONFIG.xMajorGridSize),
  yMajorGridSize: normalizeGridSize(config?.yMajorGridSize, DEFAULT_AXIS_CONFIG.yMajorGridSize),
});
