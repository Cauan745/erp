import { requireOptionalNativeModule } from 'expo';

type LegacyTaskManager = {
  isTaskRegisteredAsync(name: string): Promise<boolean>;
  unregisterTaskAsync(name: string): Promise<void>;
};

// Compatibility with installed builds that still contain the old native modules.
// No removed JS package is imported, and a rebuilt app has no such native module.
const LEGACY_TASK_NAME = 'stockroom-background-sync';

export async function removeLegacyTask(): Promise<void> {
  const manager = requireOptionalNativeModule<LegacyTaskManager>('ExpoTaskManager');
  if (!manager || !await manager.isTaskRegisteredAsync(LEGACY_TASK_NAME)) return;
  // The native TaskManager invokes the registered consumer's unregistration hook,
  // which cancels the old background worker. Leave other tasks and all data alone.
  await manager.unregisterTaskAsync(LEGACY_TASK_NAME);
  if (await manager.isTaskRegisteredAsync(LEGACY_TASK_NAME)) {
    throw new Error('legacy_task_still_registered');
  }
}
