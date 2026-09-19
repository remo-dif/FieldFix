import "@angular/compiler";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { TaskReportComponent } from "./task-report.component";
import { TaskReportService } from "./task-report.service";

const task = {
  id: "t-1",
  title: "Repair",
  assetId: "a-1",
  lastModifiedTimestamp: "2026-01-01",
};

function fixture() {
  const storage = {
    online$: new BehaviorSubject(false),
    pendingCount$: new BehaviorSubject(0),
    getTask: vi.fn().mockResolvedValue(task),
    enqueueReport: vi.fn().mockResolvedValue(undefined),
  };
  const account = { ensureAccount: vi.fn().mockResolvedValue("acct-1") };
  const page = new TaskReportComponent(
    storage as any,
    account as any,
    new TaskReportService(),
  );
  page.taskId = "t-1";
  return { page, storage, account };
}

describe("TaskReportComponent", () => {
  it("loads a cached task and saves a valid report locally", async () => {
    const f = fixture();
    await f.page.ngOnInit();
    expect(f.page.loading$.value).toBe(false);
    expect(f.page.hasParts).toBe(true);
    const row = f.page.parts.at(0);
    row.patchValue({
      sku: "P-1",
      description: "Valve",
      quantity: 2,
      unitCost: 4.25,
    });
    f.page.form.controls.status.setValue("completed");
    f.page.form.controls.technicalNotes.setValue("Replaced valve");
    expect(f.page.totalCents).toBe(850);
    await f.page.submit();
    expect(f.storage.enqueueReport).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "t-1", totalCostCents: 850 }),
    );
    expect(f.page.message).toContain("queued for sync");
    expect(f.page.hasParts).toBe(false);
    expect(f.page.saving).toBe(false);
  });

  it("keeps the form open when validation or local persistence fails", async () => {
    const f = fixture();
    await f.page.ngOnInit();
    await f.page.submit();
    expect(f.page.message).toContain("Correct the highlighted fields");
    expect(f.storage.enqueueReport).not.toHaveBeenCalled();
    const row = f.page.parts.at(0);
    row.patchValue({
      sku: "P-1",
      description: "Valve",
      quantity: 1,
      unitCost: 2,
    });
    f.page.form.controls.status.setValue("blocked");
    f.page.form.controls.technicalNotes.setValue("Awaiting access");
    f.storage.enqueueReport.mockRejectedValue(new Error("quota"));
    await f.page.submit();
    expect(f.page.message).toContain("Local save failed");
    expect(f.page.hasParts).toBe(true);
    expect(f.page.saving).toBe(false);
  });

  it("shows a missing cached task and does not submit it", async () => {
    const f = fixture();
    f.storage.getTask.mockResolvedValue(undefined);
    await f.page.ngOnInit();
    expect(f.page.message).toContain("Task unavailable");
    await f.page.submit();
    expect(f.storage.enqueueReport).not.toHaveBeenCalled();
  });

  it("requires a part after the last row is removed", async () => {
    const f = fixture();
    await f.page.ngOnInit();
    f.page.removePart(0);
    expect(f.page.hasParts).toBe(false);
    expect(f.page.message).toContain("Add at least one part");
  });
});
