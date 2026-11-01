import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { synchronize } from './service';

export const BACKGROUND_SYNC_TASK = 'stockroom-background-sync';

TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    const summary = await synchronize();
    return summary.error ? BackgroundTask.BackgroundTaskResult.Failed : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  } catch {
    // Background execution is optional and unavailable in Expo Go and some device states.
  }
}
