import "@angular/compiler";
import { describe, expect, it, vi } from "vitest";
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

  it('rejects a report without account identity before queueing', async () => {
    const service = new TaskReportService();
    const enqueueReport = vi.fn();
    const result = await service.queueReport(
      { id: 'task-1', title: 'Repair', assetId: 'asset-1', lastModifiedTimestamp: '2026-01-01' },
      '', makeForm(), { enqueueReport },
    );
    expect(result).toEqual({ ok: false, message: 'Account and task information are required before saving.' });
    expect(enqueueReport).not.toHaveBeenCalled();
  });

  it('rejects invalid fields and unsafe totals', () => {
    const service = new TaskReportService();
    const task = { id: 'task-1', title: 'Repair', assetId: 'asset-1', lastModifiedTimestamp: '2026-01-01' };
    const invalid = makeForm();
    invalid.controls.status.setErrors({ required: true });
    expect(service.validateAndBuildPayload(task, 'acct-1', invalid).isValid).toBe(false);
    const unsafe = makeForm();
    unsafe.controls.parts.at(0).controls.unitCost.setValue(Number.MAX_SAFE_INTEGER);
    expect(service.validateAndBuildPayload(task, 'acct-1', unsafe).message).toContain('Correct the highlighted fields');
  });

  it('identifies the first touched invalid part field', () => {
    const form = makeForm();
    const row = form.controls.parts.at(0);
    expect(TaskReportService.partError(9, form)).toBe('');
    row.controls.sku.setErrors({ required: true });
    row.controls.sku.markAsTouched();
    expect(TaskReportService.partError(0, form)).toContain('part code');
    row.controls.sku.setErrors(null);
    row.controls.description.setErrors({ required: true });
    row.controls.description.markAsTouched();
    expect(TaskReportService.partError(0, form)).toContain('description');
    row.controls.description.setErrors(null);
    row.controls.quantity.setErrors({ min: true });
    row.controls.quantity.markAsTouched();
    expect(TaskReportService.partError(0, form)).toContain('Quantity');
    row.controls.quantity.setErrors(null);
    row.controls.unitCost.setErrors({ min: true });
    row.controls.unitCost.markAsTouched();
    expect(TaskReportService.partError(0, form)).toContain('Unit cost');
    row.controls.unitCost.setErrors(null);
    expect(TaskReportService.partError(0, form)).toBe('');
  });
});
