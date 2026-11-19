import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../../core/api/api-error';
import { AuthService } from '../../../core/auth/auth.service';
import { ManagerDashboardDto, SuspiciousActivityMonitoringDto } from '../../../core/models';
import { UtcDatePipe } from '../../../shared/pipes/utc-date.pipe';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import { StatePanelComponent } from '../../../shared/ui/state-panel.component';
import { StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import { accountStatusSlices, transferStatusSlices } from '../manager-utils';
import { ManagerApi } from '../manager.api';
import { StatusDoughnutComponent } from './status-doughnut.component';

type LoadState = 'loading' | 'ready' | 'error';
const ATTENTION_COUNT = 5;

/**
 * /manager — monitoring overview: GET manager/dashboard tiles, transfer and account status doughnuts
 * (deferred → Chart.js in a lazy chunk), and the newest Detected suspicious activities.
 */
@Component({
  selector: 'app-manager-dashboard-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    UtcDatePipe,
    SkeletonComponent,
    StatePanelComponent,
    StatusBadgeComponent,
    StatusDoughnutComponent,
  ],
  templateUrl: './manager-dashboard-page.component.html',
  styleUrls: ['../manager.scss', './manager-dashboard-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManagerDashboardPageComponent implements OnInit {
  private readonly api = inject(ManagerApi);
  private readonly auth = inject(AuthService);

  protected readonly firstName = computed(() => this.auth.profile()?.firstName?.trim() || null);

  protected readonly state = signal<LoadState>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly stats = signal<ManagerDashboardDto | null>(null);
  protected readonly transferSlices = computed(() => {
    const s = this.stats();
    return s ? transferStatusSlices(s) : [];
  });
  protected readonly accountSlices = computed(() => {
    const s = this.stats();
    return s ? accountStatusSlices(s) : [];
  });

  protected readonly attentionState = signal<LoadState>('loading');
  protected readonly attentionError = signal<string | null>(null);
  protected readonly attention = signal<SuspiciousActivityMonitoringDto[]>([]);
  protected readonly attentionTotal = signal(0);

  ngOnInit(): void {
    this.auth.ensureProfile();
    this.load();
    this.loadAttention();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.dashboard({ silent: true }).subscribe({
      next: (stats) => {
        this.stats.set(stats);
        this.state.set('ready');
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err).message);
        this.state.set('error');
      },
    });
  }

  protected loadAttention(): void {
    this.attentionState.set('loading');
    this.api
      .suspiciousActivities({ status: 'Detected', pageNumber: 1, pageSize: ATTENTION_COUNT }, { silent: true })
      .subscribe({
        next: (page) => {
          this.attention.set(page.items);
          this.attentionTotal.set(page.totalCount);
          this.attentionState.set('ready');
        },
        error: (err: unknown) => {
          this.attentionError.set(ApiError.from(err).message);
          this.attentionState.set('error');
        },
      });
  }
}
