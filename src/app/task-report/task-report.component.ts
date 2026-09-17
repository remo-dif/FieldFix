import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBadge, IonButton, IonContent, IonHeader, IonInput, IonItem, IonLabel,
  IonList, IonNote, IonSelect, IonSelectOption, IonSkeletonText, IonTextarea, IonTitle, IonToolbar,
} from '@ionic/angular';
import { OfflineStorageService } from '../offline/offline-storage.service';
import { PartRow, ReportPayload, Task } from '../offline/offline-db';
import { AccountSessionService } from '../offline/account-session.service';

type PartForm = FormGroup<{
  sku: FormControl<string>;
  description: FormControl<string>;
  quantity: FormControl<number>;
  unitCost: FormControl<number>;
}>;
const nonBlank = (control: AbstractControl) => String(control.value ?? '').trim().length ? null : { blank: true };

@Component({
  selector: 'app-task-report', standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, IonBadge, IonButton, IonContent, IonHeader,
    IonInput, IonItem, IonLabel, IonList, IonNote, IonSelect, IonSelectOption,
    IonSkeletonText, IonTextarea, IonTitle, IonToolbar,
  ],
  templateUrl: './task-report.component.html',
  host: { class: 'ion-page' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskReportComponent implements OnInit {
  @Input({ required: true }) taskId!: string;
  task?: Task;
  private accountId?: string;
  saving = false;
  message = '';
  readonly loading$ = new BehaviorSubject<boolean>(true);
  readonly online$ = this.storage.online$;
  readonly pendingCount$ = this.storage.pendingCount$;

  readonly form = new FormGroup({
    status: new FormControl<'completed' | 'blocked' | ''>('', { nonNullable: true, validators: [Validators.required] }),
    technicalNotes: new FormControl('', { nonNullable: true, validators: [nonBlank, Validators.maxLength(4000)] }),
    parts: new FormArray<PartForm>([]),
  });

  constructor(readonly storage: OfflineStorageService, private readonly account: AccountSessionService) {}

  async ngOnInit(): Promise<void> {
    this.loading$.next(true);
    try {
      this.accountId = await this.account.ensureAccount();
      this.task = await this.storage.getTask(this.taskId);
      if (!this.task) this.message = 'Task unavailable in the local cache.';
      else this.addPart();
    } catch (error) {
      this.message = error instanceof Error ? error.message : 'Account verification failed';
    } finally {
      this.loading$.next(false);
    }
  }

  get parts(): FormArray<PartForm> { return this.form.controls.parts; }

  get hasParts(): boolean { return this.parts.length > 0; }

  partError(index: number): string {
    const row = this.parts.at(index);
    if (!row || row.valid) return '';
    const sku = row.controls.sku;
    const description = row.controls.description;
    const quantity = row.controls.quantity;
    const unitCost = row.controls.unitCost;
    if (sku.invalid && sku.touched) return 'Add a valid part code.';
    if (description.invalid && description.touched) return 'Add a part description.';
    if (quantity.invalid && quantity.touched) return 'Quantity must be at least 1.';
    if (unitCost.invalid && unitCost.touched) return 'Unit cost must be 0 or more.';
    return 'Complete this line before saving.';
  }

  /** Round each unit price to cents; the server must recalculate and validate the total. */
  get totalCents(): number {
    return this.parts.controls.reduce((sum, row) => {
      const quantity = Number(row.controls.quantity.value);
      const unitCost = Number(row.controls.unitCost.value);
      return sum + (Number.isFinite(quantity) && Number.isFinite(unitCost)
        ? quantity * Math.round(unitCost * 100) : 0);
    }, 0);
  }

  addPart(): void {
    this.parts.push(new FormGroup({
      sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(64)] }),
      description: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(240)] }),
      quantity: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)] }),
      unitCost: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    }));
  }

  removePart(index: number): void {
    this.parts.removeAt(index);
    if (!this.parts.length) this.message = 'Add at least one part before saving.';
  }

  /** Commit locally before asynchronous sync; a network timeout never removes the report. */
  async submit(): Promise<void> {
    if (this.saving || !this.task || !this.accountId) return;
    if (!this.hasParts) {
      this.form.markAllAsTouched();
      this.message = 'Add at least one replaced part before saving.';
      return;
    }
    if (this.form.invalid || !Number.isSafeInteger(this.totalCents)) {
      this.form.markAllAsTouched();
      this.message = 'Correct the highlighted fields before saving.';
      return;
    }
    this.saving = true;
    try {
      const parts: PartRow[] = this.parts.controls.map(row => ({
        sku: row.controls.sku.value.trim(),
        description: row.controls.description.value.trim(),
        quantity: Number(row.controls.quantity.value),
        unitCostCents: Math.round(Number(row.controls.unitCost.value) * 100),
      }));
      const report: ReportPayload = {
        id: crypto.randomUUID(), accountId: this.accountId, taskId: this.task.id,
        status: this.form.controls.status.value as 'completed' | 'blocked',
        technicalNotes: this.form.controls.technicalNotes.value.trim(),
        parts, totalCostCents: this.totalCents,
        lastModifiedTimestamp: this.task.lastModifiedTimestamp,
        createdAt: new Date().toISOString(),
      };
      await this.storage.enqueueReport(report);
      this.message = 'Report saved on this device and queued for sync.';
      this.form.reset();
      this.parts.clear();
    } catch {
      this.message = 'Local save failed. The form remains open; free up storage and try again.';
    } finally {
      this.saving = false;
    }
  }
}
