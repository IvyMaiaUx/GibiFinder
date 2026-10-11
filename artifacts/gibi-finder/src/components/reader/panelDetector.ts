import { PanelBox } from "./readerTypes";

/**
 * Intelligent Panel / Frame detector for Comics and Manga.
 * Analyzes an Image bitmap/canvas and identifies rectangular panel gutters
 * to allow smooth panel-by-panel guided reading.
 */
export async function detectPanelsInImage(imgElement: HTMLImageElement): Promise<PanelBox[]> {
  try {
    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;

    if (!naturalWidth || !naturalHeight) return [];

    // Fallback if image is very small
    if (naturalWidth < 100 || naturalHeight < 100) {
      return [{ x: 0, y: 0, width: 1, height: 1 }];
    }

    // Downscale to a fast analysis canvas (max 400px width/height)
    const scale = Math.min(1, 400 / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(naturalWidth * scale);
    canvas.height = Math.round(naturalHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return [{ x: 0, y: 0, width: 1, height: 1 }];

    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const w = canvas.width;
    const h = canvas.height;

    // Calculate row luminance to detect horizontal gutters (white or black strips between panels)
    const rowBrightness = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const rowOffset = y * w * 4;
      for (let x = 0; x < w; x++) {
        const offset = rowOffset + x * 4;
        const r = data[offset];
        const g = data[offset + 1];
        const b = data[offset + 2];
        sum += (r * 0.299 + g * 0.587 + b * 0.114);
      }
      rowBrightness[y] = sum / w;
    }

    // Identify candidate horizontal cut positions (gutters where brightness is near pure white > 240 or pure black < 15)
    const cuts: number[] = [0];
    const minGutterHeight = Math.max(4, Math.round(h * 0.015));
    let inGutter = false;
    let gutterStart = 0;

    for (let y = 0; y < h; y++) {
      const b = rowBrightness[y];
      const isGutterRow = b >= 242 || b <= 12;

      if (isGutterRow && !inGutter) {
        inGutter = true;
        gutterStart = y;
      } else if (!isGutterRow && inGutter) {
        inGutter = false;
        if (y - gutterStart >= minGutterHeight) {
          const midGutter = Math.round((gutterStart + y) / 2);
          if (midGutter > 10 && midGutter < h - 10) {
            cuts.push(midGutter);
          }
        }
      }
    }
    cuts.push(h);

    // If no gutters were found, divide page into reasonable 2-3 panel reading blocks
    if (cuts.length <= 2) {
      if (h / w > 1.8) {
        // Tall page: 3 vertical slices
        return [
          { x: 0, y: 0, width: 1, height: 0.35 },
          { x: 0, y: 0.32, width: 1, height: 0.36 },
          { x: 0, y: 0.65, width: 1, height: 0.35 },
        ];
      } else if (h / w > 1.2) {
        // Standard comic page: 2 slices
        return [
          { x: 0, y: 0, width: 1, height: 0.52 },
          { x: 0, y: 0.48, width: 1, height: 0.52 },
        ];
      }
      return [{ x: 0, y: 0, width: 1, height: 1 }];
    }

    // Build panel bounding boxes from detected horizontal cuts
    const panels: PanelBox[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const top = cuts[i] / h;
      const bottom = cuts[i + 1] / h;
      const height = bottom - top;

      // Filter tiny strips
      if (height > 0.08) {
        panels.push({
          x: 0,
          y: Math.max(0, top),
          width: 1,
          height: Math.min(1, height),
        });
      }
    }

    return panels.length > 0 ? panels : [{ x: 0, y: 0, width: 1, height: 1 }];
  } catch (err) {
    console.warn("Panel detection failed, using full page:", err);
    return [{ x: 0, y: 0, width: 1, height: 1 }];
  }
}
