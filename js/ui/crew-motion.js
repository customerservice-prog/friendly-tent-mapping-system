// RentSketch realistic installation crew planner with phased task sequences.
// Timing is deliberately human-paced: workers perform distinct tasks (unload, stake, raise, tension, finish)
// in sequence with task-specific poses and coordinated multi-worker heavy lifting.

export const SETUP_TIMING = {
  walkSeconds: 1.35,
  workSeconds: 2.4,
  heavyWorkSeconds: 3.4,
  stagePauseSeconds: 0.7,
};

// Phase durations as fraction of total build time
const PHASE_DURATIONS = {
  unload: 0.15,      // Component unload/layout
  ground: 0.20,      // Stake driving
  frame: 0.30,       // Pole raising
  roof: 0.20,        // Canvas/roof tensioning
  finish: 0.15,      // Valance, lighting
};

export function crewSize(widthFt) {
  return Math.max(2, Math.min(6, Math.ceil(Number(widthFt || 20) / 10)));
}

export function perimeterWorkPoints(tent) {
  const w = Number(tent?.widthFt || 20);
  const l = Number(tent?.lengthFt || 20);
  const hw = w / 2;
  const hl = l / 2;
  const out = [];

  // Perimeter points every 10ft for stake driving
  for (let x = -hw; x <= hw + 0.01; x += 10) {
    out.push({ x: Math.min(x, hw), z: -hl, job: 'stake' });
    out.push({ x: Math.min(x, hw), z: hl, job: 'stake' });
  }
  for (let z = -hl + 10; z < hl; z += 10) {
    out.push({ x: -hw, z, job: 'stake' });
    out.push({ x: hw, z, job: 'stake' });
  }

  return out;
}

export function buildWorkPlan(tent) {
  const edge = perimeterWorkPoints(tent);
  const center = (tent?.centerPoles || []).map((p) => ({
    x: (p.x ?? tent.widthFt / 2) - tent.widthFt / 2,
    z: (p.y ?? tent.lengthFt / 2) - tent.lengthFt / 2,
    job: 'center-pole',
  }));

  return [...edge, ...center, { x: 0, z: 0, job: 'roof' }, { x: 0, z: 0, job: 'finish' }];
}

export function assignCrew(tent) {
  const count = crewSize(tent?.widthFt);
  const pts = buildWorkPlan(tent);
  const roles = ['lead', 'stake', 'pole', 'canvas', 'finish', 'support'];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    role: roles[i] || 'support',
    route: pts.filter((_, n) => n % count === i),
  }));
}

// Task definitions for phased installation
const TASK_TYPES = {
  unload: { id: 'unload', phase: 'unload', duration: 1.0, workers: 2, pose: 'carry' },
  'stake-drive': { id: 'stake-drive', phase: 'ground', duration: 1.0, workers: 1, pose: 'bend-strike' },
  'corner-raise': { id: 'corner-raise', phase: 'frame', duration: 1.0, workers: 2, pose: 'lift' },
  'pole-raise': { id: 'pole-raise', phase: 'frame', duration: 1.0, workers: 4, pose: 'raise' },
  'roof-pull': { id: 'roof-pull', phase: 'roof', duration: 1.0, workers: 3, pose: 'pull' },
  'rope-tension': { id: 'rope-tension', phase: 'roof', duration: 1.0, workers: 2, pose: 'tension' },
  'valance-hang': { id: 'valance-hang', phase: 'finish', duration: 1.0, workers: 2, pose: 'reach' },
  'lighting': { id: 'lighting', phase: 'finish', duration: 1.0, workers: 1, pose: 'climb' },
};

// Worker pose with task-specific animation (returns offsets for limbs from base pose)
export function workerTaskPose(taskId, progress, timeSec) {
  // progress: 0-1 through task
  // timeSec: animation time
  // Returns: { armL, armR, torso, bend, lift, work, stride }
  // All are animation amplitudes to be applied in view3d

  const task = TASK_TYPES[taskId];
  if (!task) return { armL: 0, armR: 0, torso: 0, bend: 0, lift: 0, work: 0, stride: 0 };

  const t = progress;

  switch (task.pose) {
    case 'carry': // Unload: walking with arms carrying component
      return {
        armL: Math.sin(timeSec * 4) * 0.3,
        armR: Math.sin(timeSec * 4 + Math.PI) * 0.3,
        torso: Math.sin(timeSec * 2) * 0.1,
        bend: 0.15,
        lift: 0,
        work: 0,
        stride: Math.sin(timeSec * 6) * 0.2,
      };

    case 'bend-strike': // Stake driving: bend, raise mallet, strike
      const strike = Math.sin(t * Math.PI); // 0 at start/end, 1 at mid
      return {
        armL: 0,
        armR: -0.6 + strike * 0.4, // Arm raised up, then down for strike
        torso: 0.3 + strike * 0.2, // Slight lean into strike
        bend: 0.4 + strike * 0.1, // Deep bend
        lift: 0,
        work: strike * 0.5,
        stride: 0,
      };

    case 'lift': // Corner pole: squat, lift, raise
      return {
        armL: -0.4 - t * 0.4,
        armR: -0.4 - t * 0.4,
        torso: -0.2 - t * 0.3,
        bend: 0.5 - t * 0.4, // Start bent, straighten as lift
        lift: t * 0.8, // Rise as pole lifts
        work: Math.sin(t * Math.PI) * 0.4,
        stride: 0,
      };

    case 'raise': // Center pole: coordinated team raise (heavy)
      const coordWave = Math.sin((timeSec + t * Math.PI * 2) * 4) * 0.3; // Waves in sync
      return {
        armL: -0.5 - t * 0.3 + coordWave,
        armR: -0.5 - t * 0.3 + coordWave,
        torso: -0.3 - t * 0.2,
        bend: 0.6 - t * 0.5,
        lift: t * 1.0, // Full body raise
        work: Math.sin((timeSec + t) * 3) * 0.6,
        stride: 0,
      };

    case 'pull': // Canvas: team pulls fabric (side-to-side)
      return {
        armL: -0.5 - t * 0.3,
        armR: -0.5 - t * 0.3,
        torso: Math.sin(timeSec * 2.5) * 0.2,
        bend: 0.2,
        lift: 0,
        work: Math.sin(timeSec * 3) * 0.6,
        stride: Math.sin(timeSec * 2.5) * 0.15,
      };

    case 'tension': // Rope/strap tightening: pull, step back
      return {
        armL: -0.6 - t * 0.2,
        armR: -0.6 - t * 0.2,
        torso: 0.15 + t * 0.1,
        bend: 0.25 + t * 0.15,
        lift: -t * 0.2, // Step back/down
        work: (1 - t) * 0.5,
        stride: t * 0.3,
      };

    case 'reach': // Valance: reach up, attach
      return {
        armL: Math.sin(timeSec * 3) * 0.2 - 0.5,
        armR: Math.sin(timeSec * 3) * 0.2 - 0.5,
        torso: -0.2 + t * 0.1,
        bend: 0.1,
        lift: t * 0.4,
        work: t * 0.3,
        stride: 0,
      };

    case 'climb': // Lighting: climb ladder, install
      return {
        armL: Math.sin(timeSec * 4) * 0.3,
        armR: Math.sin(timeSec * 4 + Math.PI) * 0.3,
        torso: 0,
        bend: 0,
        lift: Math.sin(timeSec * 2) * 0.4 + 0.4, // Climbing motion
        work: t * 0.4,
        stride: 0,
      };

    default:
      return { armL: 0, armR: 0, torso: 0, bend: 0, lift: 0, work: 0, stride: 0 };
  }
}

// Determine which phase a task belongs to
export function stageForJob(job) {
  return job === 'stake'
    ? 'ground'
    : job === 'center-pole' || job === 'pole'
      ? 'frame'
      : job === 'roof'
        ? 'roof'
        : job === 'finish'
          ? 'finish'
          : 'frame';
}

// Calculate stage duration with realistic pacing
export function stageDurationMs(stage, itemCount, tentWidth = 20) {
  const n = Math.max(1, itemCount || 1);

  // Base per-item times (ms), tuned for 30-60 sec total animation
  const perItem = {
    unload: 150,
    ground: 200,  // Stake driving relatively slow
    frame: 250,   // Pole raising slower
    roof: 220,    // Canvas tensioning
    finish: 120,
  }[stage] || 150;

  // Tent-width scaling: larger tents = longer (more stakes, taller poles)
  const widthFactor = Math.max(1, Math.sqrt(tentWidth / 20));

  const baseDuration = 1100 + n * perItem * widthFactor;
  return Math.max(1800, Math.min(12000, baseDuration));
}

// Phased task sequence for a full build
export function buildTaskSequence(tent, isPole) {
  const w = Number(tent?.widthFt || 20);
  const l = Number(tent?.lengthFt || 30);
  const stakeCount = perimeterWorkPoints(tent).length;
  const poleCount = isPole ? (tent?.centerPoles || []).length : 0;

  const phases = [];

  // Phase 1: Unload
  phases.push({
    name: 'unload',
    duration: stageDurationMs('unload', 2, w),
    tasks: [{ id: 'unload', count: 2, pose: 'carry' }],
  });

  // Phase 2: Ground (stakes)
  phases.push({
    name: 'ground',
    duration: stageDurationMs('ground', stakeCount, w),
    tasks: [{ id: 'stake-drive', count: stakeCount, pose: 'bend-strike' }],
  });

  // Phase 3: Frame (poles)
  if (isPole) {
    // Pole tent: raise center poles with heavy team, then corners
    phases.push({
      name: 'frame',
      duration: stageDurationMs('frame', 1 + poleCount, w),
      tasks: [
        { id: 'corner-raise', count: 4, pose: 'lift' }, // 4 corners
        { id: 'pole-raise', count: poleCount, pose: 'raise' }, // center poles
      ],
    });
  } else {
    // Frame tent: raise perimeter frame poles progressively
    phases.push({
      name: 'frame',
      duration: stageDurationMs('frame', 4, w),
      tasks: [{ id: 'corner-raise', count: 4, pose: 'lift' }],
    });
  }

  // Phase 4: Roof/Canvas
  phases.push({
    name: 'roof',
    duration: stageDurationMs('roof', 2, w),
    tasks: [
      { id: 'roof-pull', count: 1, pose: 'pull' },
      { id: 'rope-tension', count: stakeCount / 8, pose: 'tension' },
    ],
  });

  // Phase 5: Finish
  phases.push({
    name: 'finish',
    duration: stageDurationMs('finish', 2, w),
    tasks: [
      { id: 'valance-hang', count: 4, pose: 'reach' },
      { id: 'lighting', count: 2, pose: 'climb' },
    ],
  });

  return phases;
}

// Estimate total build time (seconds)
export function estimateBuildTime(tent) {
  const isPole = tent?.type === 'pole';
  const phases = buildTaskSequence(tent, isPole);
  const totalMs = phases.reduce((sum, p) => sum + p.duration, 0);
  return Math.round(totalMs / 1000);
}

// Worker position during task execution
export function workerTaskPosition(worker, taskId, progress, currentPhaseStart) {
  const route = worker.route || [];
  if (!route.length) return { x: 0, z: 0, heading: 0 };

  // Simple: walk along route as task progresses
  const idx = Math.min(Math.floor(progress * route.length), route.length - 1);
  const point = route[idx];

  return {
    x: point?.x || 0,
    z: point?.z || 0,
    heading: point?.heading || 0,
  };
}

