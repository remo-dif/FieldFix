import { Injectable } from "@angular/core";
import { OfflineStorageService } from "../offline/offline-storage.service";
import { Task } from "../offline/offline-db";

export interface TaskListLoadResult {
  tasks: Task[];
  error: string | null;
}

export type TaskFetch = (input: RequestInfo | URL) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface TaskListStorage {
  getTasks(): Promise<Task[]>;
  replaceTasks(tasks: readonly Task[]): Promise<void>;
}

@Injectable({ providedIn: "root" })
export class TaskListService {
  constructor(private readonly storage: OfflineStorageService) {}

  async loadTasksForAccount(
    accountId: string,
    fetcher: TaskFetch = fetch,
  ): Promise<TaskListLoadResult> {
    let cachedTasks: Task[];
    try {
      cachedTasks = await this.storage.getTasks();
    } catch {
      cachedTasks = [];
    }

    try {
      const response = await fetcher(
        `/api/accounts/${encodeURIComponent(accountId)}/tasks`,
      );

      if (response.status === 401 || response.status === 403) {
        return {
          tasks: [],
          error: "Your session no longer permits access to these tasks.",
        };
      }

      if (!response.ok) {
        return { tasks: cachedTasks, error: null };
      }

      const tasks = (await response.json()) as Task[];
      if (!Array.isArray(tasks)) {
        throw new Error("Tasks API returned an invalid task list");
      }

      await this.storage.replaceTasks(tasks);

      return { tasks, error: null };
    } catch (error) {
      return {
        tasks: cachedTasks,
        error: error instanceof Error ? error.message : "Could not load tasks",
      };
    }
  }
}
