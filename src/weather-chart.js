// SPDX-License-Identifier: GPL-3.0-only
import { escapeText } from './html.js';

// All series share one scale. Missing samples break the line instead of becoming zero.
export function forecastPlot(series, count, bounds = {}) {
  const values = series.flatMap(line => line.values).filter(Number.isFinite);
  const min = bounds.min ?? (values.length ? Math.min(...values) : 0);
  const max = bounds.max ?? (values.length ? Math.max(...values) : 1);
  return series.map(line => {
    let connected = false;
    const points = line.values.map((value, index) => {
      const x = (index + .5) / count * 100;
      const y = !Number.isFinite(value) || max === min ? 50 : 78 - (value - min) / (max - min) * 56;
      return {x, y, value};
    });
    const path = points.map(point => {
      if (!Number.isFinite(point.value)) { connected = false; return ''; }
      const command = connected ? 'L' : 'M'; connected = true;
      return `${command}${point.x.toFixed(3)},${point.y.toFixed(3)}`;
    }).join(' ');
    return {...line, points, path};
  });
}

export function forecastChart(series, count, bounds) {
  const lines = forecastPlot(series, count, bounds);
  return `<div class="weather-chart" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${lines.map(line => `<path class="${line.low ? 'weather-line-low' : ''}" d="${line.path}" vector-effect="non-scaling-stroke"/>`).join('')}</svg>${lines.map(line => line.points.map(point => `<span class="weather-chart-point ${line.low ? 'weather-point-low' : ''} ${Number.isFinite(point.value) ? '' : 'weather-point-missing'}" style="left:${point.x}%;top:${point.y}%"><i></i><span>${escapeText(line.format(point.value))}</span></span>`).join('')).join('')}</div>`;
}
