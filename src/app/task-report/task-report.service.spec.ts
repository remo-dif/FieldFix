import "@angular/compiler";
import { describe, expect, it } from "vitest";
import { FormArray, FormControl, FormGroup } from "@angular/forms";
import { TaskReportService } from "./task-report.service";

const makeForm = () =>
  new FormGroup({
    status: new FormControl<"completed" | "blocked" | "">("", {
      nonNullable: true,
    }),
    technicalNotes: new FormControl("Notes", { nonNullable: true }),
    parts: new FormArray([
      new FormGroup({
        sku: new FormControl("SKU-1", { nonNullable: true }),
        description: new FormControl("Brake pad", { nonNullable: true }),
        quantity: new FormControl(2, { nonNullable: true }),
        unitCost: new FormControl(12.5, { nonNullable: true }),
      }),
    ]),
  });

describe("TaskReportService", () => {
  it("builds a payload for a valid report and calculates total cost", () => {
    const service = new TaskReportService();
    const task = {
      id: "task-1",
      title: "Repair lift",
      assetId: "asset-1",
      lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
    };

    const result = service.validateAndBuildPayload(task, "acct-1", makeForm());

    expect(result.isValid).toBe(true);
    expect(result.totalCents).toBe(2500);
    expect(result.payload?.parts).toHaveLength(1);
    expect(result.payload?.status).toBe("");
  });

  it("rejects a report with no parts", () => {
    const service = new TaskReportService();
    const form = makeForm();
    form.controls.parts.clear();

    const result = service.validateAndBuildPayload(
      {
        id: "task-1",
        title: "Repair lift",
        assetId: "asset-1",
        lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      },
      "acct-1",
      form,
    );

    expect(result.isValid).toBe(false);
    expect(result.message).toBe("Add at least one replaced part before saving.");
  });

  it("queues a valid payload through storage", async () => {
    const service = new TaskReportService();
    const form = makeForm();
    const storage = {
      enqueueReport: async (payload: any) => payload,
    };

    const result = await service.queueReport(
      {
        id: "task-1",
        title: "Repair lift",
        assetId: "asset-1",
        lastModifiedTimestamp: "2025-01-01T00:00:00.000Z",
      },
      "acct-1",
      form,
      storage,
    );

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Report saved on this device and queued for sync.");
  });
});
