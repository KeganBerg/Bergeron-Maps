import Konva from 'konva';

/**
 * Konva draws every layer of a stage right away, in two places, and both cost
 * a full drawing of a big map:
 *
 * - Each time the stage's width or height changes. A new size sets both, so
 *   each resize drew a big map twice.
 * - Each time a layer is added. react-konva makes the stage at its first size
 *   and adds the layers before it applies the stage's other props, so a big
 *   map was drawn once at a made-up size and position (and even when the stage
 *   was meant to start hidden), then again for real.
 *
 * Here both ask for one drawing on the next animation frame instead. That still
 * comes before the browser paints, so nothing flickers, and by then the stage
 * has its real size, position and visibility. Requests in the same frame share
 * one drawing.
 */
type Patched = Konva.Stage & { _resizeDOM(): void; __resizePending?: boolean };
const proto = Konva.Stage.prototype as unknown as Patched & { __drawLater?: boolean };

if (!proto.__drawLater) {
  proto.__drawLater = true;

  // Same as Konva's own resize, except the layers are redrawn on the next frame.
  proto._resizeDOM = function (this: Patched) {
    if (this.__resizePending) return;
    this.__resizePending = true;
    queueMicrotask(() => {
      this.__resizePending = false;
      const width = this.width();
      const height = this.height();
      const s = this as unknown as { content?: HTMLDivElement; bufferCanvas: { setSize(w: number, h: number): void }; bufferHitCanvas: { setSize(w: number, h: number): void } };
      if (s.content) {
        s.content.style.width = `${width}px`;
        s.content.style.height = `${height}px`;
      }
      s.bufferCanvas.setSize(width, height);
      s.bufferHitCanvas.setSize(width, height);
      for (const layer of this.getLayers()) {
        layer.setSize({ width, height });
        layer.batchDraw();
      }
    });
  };

  const add = proto.add;
  proto.add = function (this: Konva.Stage, ...layers: Konva.Layer[]) {
    for (const layer of layers) {
      const own = Object.prototype.hasOwnProperty.call(layer, 'draw');
      const draw = layer.draw;
      layer.draw = function (this: Konva.Layer) {
        this.batchDraw();
        return this;
      };
      try {
        add.call(this, layer);
      } finally {
        if (own) layer.draw = draw;
        else delete (layer as { draw?: unknown }).draw;
      }
    }
    return this;
  } as typeof proto.add;
}
