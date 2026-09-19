import { Injectable } from "@angular/core";
import { AbstractControl, FormArray, FormGroup } from "@angular/forms";
import { PartRow, ReportPayload, Task } from "../offline/offline-db";

export interface TaskReportValidationResult {
  isValid: boolean;
  message: string;
  totalCents: number;
  parts: PartRow[];
  payload?: ReportPayload;
}

export interface TaskReportStorage {
  enqueueReport(payload: ReportPayload): Promise<void>;
}

@Injectable({ providedIn: "root" })
export class TaskReportService {
  validateAndBuildPayload(
    task: Task,
    accountId: string,
    form: FormGroup,
  ): TaskReportValidationResult {
    const partsControl = form.controls.parts as FormArray;
    const hasParts = partsControl.length > 0;

    if (!task || !accountId) {
      return {
        isValid: false,
        message: "Account and task information are required before saving.",
        totalCents: 0,
        parts: [],
      };
    }

    if (!hasParts) {
      return {
        isValid: false,
        message: "Add at least one replaced part before saving.",
        totalCents: 0,
        parts: [],
      };
    }

    if (
      form.invalid ||
      !Number.isSafeInteger(this.calculateTotalCents(partsControl))
    ) {
      return {
        isValid: false,
        message: "Correct the highlighted fields before saving.",
        totalCents: 0,
        parts: [],
      };
    }

    const parts: PartRow[] = partsControl.controls.map((row) => {
      const part = row as FormGroup;
      const quantity = Number(part.controls.quantity.value);
      const unitCost = Number(part.controls.unitCost.value);

      return {
        sku: String(part.controls.sku.value).trim(),
        description: String(part.controls.description.value).trim(),
        quantity,
        unitCostCents: Math.round(unitCost * 100),
      };
    });

    const totalCents = this.calculateTotalCents(partsControl);
    const payload: ReportPayload = {
      id: crypto.randomUUID(),
      accountId,
      taskId: task.id,
      status: form.controls.status.value as "completed" | "blocked",
      technicalNotes: String(form.controls.technicalNotes.value).trim(),
      parts,
      totalCostCents: totalCents,
      lastModifiedTimestamp: task.lastModifiedTimestamp,
      createdAt: new Date().toISOString(),
    };

    return {
      isValid: true,
      message: "Report is ready to queue.",
      totalCents,
      parts,
      payload,
    };
  }

  private calculateTotalCents(parts: FormArray | PartRow[]): number {
    const rows = Array.isArray(parts) ? parts : parts.controls;

    return rows.reduce((sum, entry) => {
      if (Array.isArray(parts)) {
        const row = entry as PartRow;
        return sum + row.quantity * row.unitCostCents;
      }

      const row = entry as FormGroup;
      const quantity = Number(row.controls.quantity.value);
      const unitCost = Number(row.controls.unitCost.value);
      return (
        sum +
        (Number.isFinite(quantity) && Number.isFinite(unitCost)
          ? quantity * Math.round(unitCost * 100)
          : 0)
      );
    }, 0);
  }

  async queueReport(
    task: Task,
    accountId: string,
    form: FormGroup,
    storage: TaskReportStorage,
  ): Promise<{ ok: boolean; message: string }> {
    const result = this.validateAndBuildPayload(task, accountId, form);

    if (!result.isValid || !result.payload) {
      return { ok: false, message: result.message };
    }

    await storage.enqueueReport(result.payload);
    return {
      ok: true,
      message: "Report saved on this device and queued for sync.",
    };
  }

  static partError(index: number, form: FormGroup): string {
    const row = (form.controls.parts as FormArray).at(
      index,
    ) as FormGroup | null;
    if (!row || row.valid) return "";

    const sku = row.controls.sku as AbstractControl;
    const description = row.controls.description as AbstractControl;
    const quantity = row.controls.quantity as AbstractControl;
    const unitCost = row.controls.unitCost as AbstractControl;

    if (sku.invalid && sku.touched) return "Add a valid part code.";
    if (description.invalid && description.touched)
      return "Add a part description.";
    if (quantity.invalid && quantity.touched)
      return "Quantity must be at least 1.";
    if (unitCost.invalid && unitCost.touched)
      return "Unit cost must be 0 or more.";

    return "Complete this line before saving.";
  }

  static nonBlank(control: AbstractControl): { blank: true } | null {
    return String(control.value ?? "").trim().length ? null : { blank: true };
  }
}
