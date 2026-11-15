import Konva from 'konva';

/**
 * Konva redraws every layer of a stage, right away, each time the stage's
 * width or height changes. A new size sets both, so each resize drew a big map
 * twice. Here the redraw waits for the end of the current task (still before
 * the browser paints, so nothing flickers) and runs once with the final size.
 */
type Resizable = Konva.Stage & { _resizeDOM(): void; __resizePending?: boolean };
const proto = Konva.Stage.prototype as unknown as Resizable;
const resizeNow = proto._resizeDOM;
if (!(resizeNow as { coalesced?: boolean }).coalesced) {
  const coalesced = function (this: Resizable) {
    if (this.__resizePending) return;
    this.__resizePending = true;
    queueMicrotask(() => {
      this.__resizePending = false;
      resizeNow.call(this);
    });
  };
  (coalesced as { coalesced?: boolean }).coalesced = true;
  proto._resizeDOM = coalesced;
}
