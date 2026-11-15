import { HttpContextToken } from '@angular/common/http';

/** Do not show the global error toast; the caller displays the error itself (e.g. inline form errors). */
export const SILENT_ERROR = new HttpContextToken<boolean>(() => false);

/** Do not attach the access token and do not attempt a refresh on 401 (login, refresh, revoke...). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);
