import { Pipe, PipeTransform } from '@angular/core';

/** The backend masks other people's account numbers as "**************1234" (last 4 visible). */
export function isMaskedAccountNumber(value: string | null | undefined): boolean {
  return !!value && value.includes('*');
}

/** "**************1234" → "•••• 1234"; full numbers are returned unchanged. */
export function formatAccountNumber(value: string | null | undefined): string {
  if (!value) return '';
  return isMaskedAccountNumber(value) ? `•••• ${value.replace(/\*/g, '')}` : value;
}

/** `{{ n | accountNumber }}`: compact display for masked numbers (see formatAccountNumber). */
@Pipe({ name: 'accountNumber' })
export class AccountNumberPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatAccountNumber(value);
  }
}
