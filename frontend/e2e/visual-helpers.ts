import type { Locator } from "@playwright/test";

export async function textAppearance(locator: Locator) {
  return locator.evaluate((element) => {
    type Color = [number, number, number, number];
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Cannot measure rendered CSS colors");
    const rgba = (color: string): Color => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return [pixel[0], pixel[1], pixel[2], pixel[3] / 255];
    };
    const composite = (top: Color, bottom: Color): Color => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      const channel = (index: number) =>
        (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha;
      return [channel(0), channel(1), channel(2), alpha];
    };
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current);
    const layers = ancestors.reverse().map((ancestor) => {
      const style = getComputedStyle(ancestor);
      return { background: rgba(style.backgroundColor), opacity: Number(style.opacity) };
    });
    const text = rgba(getComputedStyle(element).color);
    const render = (index: number, includeText: boolean): Color => {
      const layer = layers[index];
      let color = layer.background;
      if (index < layers.length - 1) color = composite(render(index + 1, includeText), color);
      else if (includeText) color = composite(text, color);
      return [color[0], color[1], color[2], color[3] * layer.opacity];
    };
    const background = composite(render(0, false), [255, 255, 255, 1]);
    const foreground = composite(render(0, true), [255, 255, 255, 1]);
    const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, value, index) => {
      const channel = value / 255;
      const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return {
      opacity: layers.reduce((value, layer) => value * layer.opacity, 1),
      backgroundLuminance,
      ratio: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
    };
  });
}
