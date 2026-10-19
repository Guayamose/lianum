// Type-only frame contract retained from the original VoiceOrbs adapter.
import type {OrbState,StateWeights} from './orb-state';
export interface OrbFrame {
  dt: number;
  dPhase: number;
  phase: number;
  time: number;
  weights: StateWeights;
  level: number;
  live: boolean;
  reduced: boolean;
  state: OrbState;
}

