// Fit the complete tent envelope to the real viewport, including portrait phones.
// The returned camera looks toward target with the world's Y axis up.
export function fitTentCamera(tent, peakHeight, aspect, fovDegrees, clearance = 0) {
  const direction = [.85, .60, 1];
  const length = Math.hypot(...direction);
  const forward = direction.map(n => n / length);
  const rightLength = Math.hypot(forward[0], forward[2]);
  const right = [forward[2] / rightLength, 0, -forward[0] / rightLength];
  const up = [forward[1] * right[2], forward[2] * right[0] - forward[0] * right[2], -forward[1] * right[0]];
  const target = [0, peakHeight / 2, 0];
  const tanV = Math.tan(fovDegrees * Math.PI / 360);
  const tanH = tanV * Math.max(.1, aspect);
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  let distance = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const p = [x * (tent.widthFt / 2 + clearance), y * peakHeight / 2, z * (tent.lengthFt / 2 + clearance)];
    distance = Math.max(distance, dot(p, forward) + Math.abs(dot(p, right)) * 1.16 / tanH, dot(p, forward) + Math.abs(dot(p, up)) * 1.16 / tanV);
  }
  return { target, position: forward.map((n, i) => target[i] + n * distance) };
}
