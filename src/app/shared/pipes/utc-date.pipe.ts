import { formatDate } from '@angular/common';
import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';
import { parseUtc } from '../../core/util/date';

/**
 * Formats backend dates (UTC without `Z`) in the user's local time.
 * Usage: `{{ item.createdAt | utcDate }}` or `{{ item.createdAt | utcDate: 'mediumDate' }}`
 */
@Pipe({ name: 'utcDate' })
export class UtcDatePipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(value: string | Date | null | undefined, format = 'medium'): string | null {
    const date = parseUtc(value);
    return date ? formatDate(date, format, this.locale) : null;
  }
}
