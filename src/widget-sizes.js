// SPDX-License-Identifier: GPL-3.0-only
export const TILE_SIZES = Object.freeze(['1x1', '1x2', '2x1', '2x2', '4x2']);
export const REQUIRED_WIDGET_SIZES = Object.freeze(['1x1', '2x2']);
export const sizeLabel = size => size.replace('x', ' × ');
export const isCompactWidget = size => size === '1x1' || size === '1x2' || size === '2x1';

// Labels occupy the gap below an icon, never part of a widget's square cell.
export function gridMetrics(settings, viewportWidth = 1350) {
  const ratio = Math.min(1, Math.max(0.8, viewportWidth / 1350));
  return { cell: settings.gridSize * ratio, gap: settings.gap * ratio };
}

export function widgetDimensions(size, metrics) {
  const [columns, rows] = size.split('x').map(Number);
  return { width: columns * metrics.cell + (columns - 1) * metrics.gap,
    height: rows * metrics.cell + (rows - 1) * metrics.gap };
}
