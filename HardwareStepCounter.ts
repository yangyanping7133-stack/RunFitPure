import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { HardwareStepCounter } = NativeModules;

const stepEmitter = Platform.OS === 'android' && HardwareStepCounter
  ? new NativeEventEmitter(HardwareStepCounter)
  : null;

export interface StepCountEvent {
  steps: number;       // steps since we started listening
  totalSteps: number; // device lifetime steps
  source: string;
}

export interface StepDetectedEvent {
  timestamp: number;
  source: string;
}

export const HardwareStepCounterModule = {
  isAvailable: (): Promise<boolean> => {
    if (!HardwareStepCounter) return Promise.resolve(false);
    return HardwareStepCounter.isAvailable();
  },

  start: (): Promise<boolean> => {
    if (!HardwareStepCounter) return Promise.reject('HardwareStepCounter not available');
    return HardwareStepCounter.start();
  },

  stop: (): Promise<boolean> => {
    if (!HardwareStepCounter) return Promise.resolve(true);
    return HardwareStepCounter.stop();
  },

  addStepCountListener: (callback: (event: StepCountEvent) => void) => {
    return stepEmitter?.addListener('onStepCount', callback) ?? { remove: () => {} };
  },

  addStepDetectedListener: (callback: (event: StepDetectedEvent) => void) => {
    return stepEmitter?.addListener('onStepDetected', callback) ?? { remove: () => {} };
  },
};
