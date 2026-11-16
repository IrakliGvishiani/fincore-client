import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { VirtualCardDto } from '../../core/models';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { displayStatus, formatExpiry } from './card-utils';

/** A payment-card look: brand, name, "•••• •••• •••• 1234", MM/YY and status. Muted when not Active. */
@Component({
  selector: 'app-card-visual',
  imports: [StatusBadgeComponent],
  template: `
    @let c = card();
    <div class="face" [attr.data-status]="status()" [class.compact]="compact()">
      <div class="top">
        <span class="brand">FinCore</span>
        <app-status-badge [status]="status()" />
      </div>
      <div class="chip" aria-hidden="true"></div>
      <div class="number mono" [attr.aria-label]="'Card ending in ' + c.last4Digits">
        <span aria-hidden="true">•••• •••• ••••</span> {{ c.last4Digits }}
      </div>
      <div class="bottom">
        <span class="name">{{ c.name }}</span>
        <span class="expiry">
          <span class="label">Valid thru</span>
          <span class="mono">{{ expiry() }}</span>
        </span>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }
    .face {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 10px;
      aspect-ratio: 1.586;
      max-width: 400px;
      padding: 18px 20px;
      border-radius: 16px;
      color: #fff;
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 55%, #0ea5e9 100%);
      box-shadow: var(--mat-sys-level2);
      overflow: hidden;
    }
    .face[data-status='Frozen'] {
      background: linear-gradient(135deg, #334155 0%, #64748b 60%, #94a3b8 100%);
    }
    .face[data-status='Closed'],
    .face[data-status='Expired'] {
      background: linear-gradient(135deg, #3f3f46 0%, #52525b 100%);
      opacity: 0.75;
    }
    .face.compact {
      gap: 6px;
      padding: 14px 16px;
    }
    .top,
    .bottom {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .bottom {
      margin-top: auto;
      align-items: flex-end;
    }
    .brand {
      font: var(--mat-sys-title-medium);
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .chip {
      width: 40px;
      height: 30px;
      border-radius: 6px;
      background: linear-gradient(135deg, #fde68a, #d97706);
    }
    .compact .chip {
      width: 32px;
      height: 24px;
    }
    .number {
      font-size: clamp(16px, 7cqi, 24px);
      letter-spacing: 0.08em;
      white-space: nowrap;
    }
    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: var(--mat-sys-body-large);
    }
    .expiry {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      flex: none;
    }
    .label {
      font-size: 10px;
      text-transform: uppercase;
      opacity: 0.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CardVisualComponent {
  readonly card = input.required<VirtualCardDto>();
  readonly compact = input(false);

  protected readonly status = computed(() => displayStatus(this.card()));
  protected readonly expiry = computed(() => formatExpiry(this.card()));
}
