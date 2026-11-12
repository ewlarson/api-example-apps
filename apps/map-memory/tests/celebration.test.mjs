import test from 'node:test';
import assert from 'node:assert/strict';
import { createCelebration } from '../celebration.mjs';

function fixture(reducedMotion = () => false) {
  let next = 0, requested = 0;
  const callbacks = new Map(), cancelled = [];
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) });
  const canvas = { hidden: true, getContext: () => context };
  const celebration = createCelebration(canvas, {
    reducedMotion, viewport: () => ({ width: 390, height: 844, scale: 2 }), random: () => .5,
    requestFrame: callback => { requested++; callbacks.set(++next, callback); return next; },
    cancelFrame: id => { cancelled.push(id); callbacks.delete(id); },
  });
  const tick = timestamp => {
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(timestamp));
  };
  return { canvas, celebration, tick, callbacks, cancelled, requested: () => requested };
}

test('a win launches confetti once; repeated completion renders do not relaunch it', () => {
  const f = fixture();
  f.celebration.update(false); assert.equal(f.requested(), 0);
  f.celebration.update(true); assert.equal(f.canvas.hidden, false); assert.equal(f.requested(), 1);
  assert.equal(f.canvas.width, 780); assert.equal(f.canvas.height, 1688);
  f.celebration.update(true); assert.equal(f.requested(), 1);
  f.tick(100); f.tick(4000);
  assert.equal(f.canvas.hidden, true); assert.equal(f.callbacks.size, 0);
});
test('replay cancels confetti and a later win can celebrate again', () => {
  const f = fixture(); f.celebration.update(true);
  const staleFrame = [...f.callbacks.values()][0];
  f.celebration.update(false);
  assert.equal(f.canvas.hidden, true); assert.equal(f.cancelled.length, 1);
  staleFrame(100); assert.equal(f.callbacks.size, 0);
  f.celebration.update(true); assert.equal(f.canvas.hidden, false); assert.equal(f.requested(), 2);
});
test('reduced motion skips the explosion and changing the preference stops a running effect', () => {
  let reduced = true;
  const f = fixture(() => reduced);
  f.celebration.update(true); assert.equal(f.canvas.hidden, true); assert.equal(f.requested(), 0);
  reduced = false; f.celebration.update(false); f.celebration.update(true);
  assert.equal(f.canvas.hidden, false);
  reduced = true; f.tick(100);
  assert.equal(f.canvas.hidden, true); assert.equal(f.callbacks.size, 0);
});
