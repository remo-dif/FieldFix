import { describe, expect, it, vi } from "vitest";
import { TaskListService } from "./task-list.service";

describe("TaskListService", () => {
  it("returns cached tasks when the network is unavailable", async () => {
    const storage = {
      getTasks: vi
        .fn()
        .mockResolvedValue([
          {
            id: "t1",
            title: "Task 1",
            assetId: "A-1",
            lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
          },
        ]),
      replaceTasks: vi.fn(),
    } as any;

    const service = new TaskListService(storage);
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await service.loadTasksForAccount("acct-1", fetcher);

    expect(result.tasks).toHaveLength(1);
    expect(result.error).toBe("network down");
    expect(storage.getTasks).toHaveBeenCalledTimes(1);
  });

  it("returns refreshed tasks from the API and rewrites the local cache", async () => {
    const storage = {
      getTasks: vi.fn().mockResolvedValue([]),
      replaceTasks: vi.fn().mockResolvedValue(undefined),
    } as any;

    const service = new TaskListService(storage);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "t2",
          title: "Task 2",
          assetId: "A-2",
          lastModifiedTimestamp: "2025-01-02T00:00:00.000Z",
        },
      ],
    });

    const result = await service.loadTasksForAccount("acct-1", fetcher);

    expect(result.tasks).toHaveLength(1);
    expect(result.error).toBeNull();
    expect(storage.replaceTasks).toHaveBeenCalledWith(result.tasks);
  });
});
