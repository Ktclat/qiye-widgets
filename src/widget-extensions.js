// SPDX-License-Identifier: GPL-3.0-only
// Import packaged widget definitions here. See docs/WIDGETS.md and widget-example.js.
import { fileConverterWidget } from './widget-file-converter.js';
import { imageCompressorWidget } from './image-compressor-widget.js';
export const widgetExtensions = [imageCompressorWidget, fileConverterWidget];
