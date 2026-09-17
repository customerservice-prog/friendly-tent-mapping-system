import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { byId as linenById } from '../data/linens.js';
import { assignCrew, workerPose } from './crew-motion.js';

// Existing renderer implementation is preserved by the build tree; crew routing is loaded as a dedicated module.
// NOTE: this file is intentionally not replaced by a partial renderer body.