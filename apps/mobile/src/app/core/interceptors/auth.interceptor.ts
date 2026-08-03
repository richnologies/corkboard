import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Auth endpoints where a 401 means bad credentials / wrong password,
 * not an expired session — do not force logout.
 */
const AUTH_CREDENTIAL_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/password',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isCredentialRequest(req.url)
      ) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};

function isCredentialRequest(url: string): boolean {
  return AUTH_CREDENTIAL_PATHS.some((path) => url.includes(path));
}
