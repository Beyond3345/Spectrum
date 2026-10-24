// The composer's modes. A stub until build/c-frame's own list replaces it: only the circuit mode is here.
import type { DiagramMode } from '../types';
import circuitikz from './circuitikz';

export const MODES: DiagramMode<any>[] = [circuitikz];
