import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiError } from '../api/api-error';
import { SILENT_ERROR } from '../api/http-context';
import { ToastService } from '../notify/toast.service';

/**
 * Outermost interceptor: converts every HttpErrorResponse into an ApiError
 * and shows a toast unless the request opted out with SILENT_ERROR.
 * 401s are not toasted: the auth interceptor/AuthService handles them.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        return throwError(() => err);
      }
      const apiError = ApiError.fromHttpError(err);
      if (!req.context.get(SILENT_ERROR) && apiError.status !== 401) {
        toast.error(apiError.message);
      }
      return throwError(() => apiError);
    }),
  );
};
