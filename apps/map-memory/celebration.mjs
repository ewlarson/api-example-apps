// Local canvas confetti: no extra library or network request, and no input interception.
export function createCelebration(canvas, {
  reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = frame => cancelAnimationFrame(frame),
  viewport = () => ({ width: innerWidth, height: innerHeight, scale: Math.min(devicePixelRatio || 1, 2) }),
  random = Math.random,
} = {}) {
  let completed = false, frame = null, generation = 0;
  function clear() {
    generation++;
    if (frame !== null) cancelFrame(frame);
    frame = null;
    canvas.hidden = true;
  }
  function burst() {
    const context = canvas.getContext('2d');
    if (!context) return;
    const { width, height, scale } = viewport();
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    canvas.hidden = false;
    const colors = ['#e9ad38', '#de704b', '#347a79', '#7d9a59', '#f4ce6a', '#f8eee0'];
    const particles = Array.from({ length: 220 }, (_, index) => {
      const left = index % 2 === 0;
      return {
        x: width * (left ? .12 : .88), y: height * .8,
        vx: (left ? 1 : -1) * (90 + random() * Math.min(width, 900)),
        vy: -(height * .75 + 280 + random() * 500),
        angle: random() * Math.PI * 2, spin: (random() - .5) * 14,
        size: 5 + random() * 7, color: colors[index % colors.length],
        round: index % 5 === 0, delay: random() * .18,
      };
    });
    const activeGeneration = generation;
    let start, previous;
    function draw(timestamp) {
      if (activeGeneration !== generation) return;
      if (reducedMotion()) { clear(); return; }
      start ??= timestamp; previous ??= timestamp;
      const elapsed = (timestamp - start) / 1000;
      const delta = Math.min((timestamp - previous) / 1000, .04);
      previous = timestamp;
      if (elapsed > 3.8) { clear(); return; }
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.min(1, (3.8 - elapsed) / .8);
      for (const particle of particles) {
        if (elapsed < particle.delay) continue;
        particle.vy += 850 * delta;
        particle.vx *= Math.exp(-.35 * delta);
        particle.x += particle.vx * delta; particle.y += particle.vy * delta;
        particle.angle += particle.spin * delta;
        context.save(); context.translate(particle.x, particle.y); context.rotate(particle.angle);
        context.fillStyle = particle.color;
        if (particle.round) {
          context.beginPath(); context.arc(0, 0, particle.size / 2, 0, Math.PI * 2); context.fill();
        } else {
          context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * (.3 + Math.abs(Math.cos(particle.angle))));
        }
        context.restore();
      }
      frame = requestFrame(draw);
    }
    frame = requestFrame(draw);
  }
  return {
    update(isComplete) {
      if (!isComplete) { completed = false; clear(); return; }
      if (completed) return;
      completed = true;
      // The static celebratory completion panel remains for reduced-motion users.
      if (!reducedMotion()) burst();
    },
    clear,
  };
}
