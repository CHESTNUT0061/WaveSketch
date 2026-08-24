export function isCollapsibleAxisViewport(width: number, height: number, coarsePointer: boolean): boolean {
  return width <= 1024 || Math.min(width, height) < 600 || (coarsePointer && width <= 1366);
}
