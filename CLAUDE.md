# FinCore Client — Angular frontend

Graduation project: digital banking simulator. This repo is the **Angular 19** frontend only.

## Hard rules
- **Backend is READ-ONLY**: `C:\Users\user\source\repos\FinCore` (ASP.NET Core, Clean Architecture). Never modify it. The owner fixes backend issues personally.
- All changes go into this repo (`fincore-client`).
- Work module by module; stop after each step for the owner's review.
- Do not invent endpoints. If the backend lacks something, leave it out of the UI.
- Reset password: the backend emails a link to `{FrontendBaseUrl}/reset-password?email=&token=` (see Auth). Email and token come only from that link (no manual entry).

## Stack decisions
- Angular 19, standalone components, signals, functional interceptors/guards, lazy `loadComponent`/`loadChildren`.
- Angular Material (M3 theme in `src/styles.scss`), Chart.js via **ng2-charts** (install when analytics is built).
- English UI only.
- Dev: backend runs in Docker on `http://localhost:8080`; `ng serve` proxies `/api` there via `proxy.conf.json` (same-origin, so CORS is not involved). The backend now has a CORS policy allowing only `AppSettings:FrontendBaseUrl` (default `http://localhost:4200`); prod should still be same-origin (nginx serves SPA + proxies `/api`).

## Implementation plan (status)
1. Foundation ✅ (proxy, env, models, ApiClient, AuthService, interceptors, guards, shell, toasts)
2. Auth screens ✅ (login, register, confirm + resend cooldown, forgot, reset; profile in user menu)
3. Profile ✅ (view, edit name/phone, photo upload/remove)
4. Accounts · 5. Transfers · 6. Saved recipients · 7. Conversions · 8. Cards + payments · 9. Dashboard/analytics · 10. Manager panel · 11. Admin panel · 12. Docker/nginx

## Project layout
```
src/app/core/api        ApiClient (unwraps CommonResponse.result, normalizes paging), ApiError, error-messages.ts (ALL message-text matching lives here)
src/app/core/auth       AuthService (signals), token storage, JWT decode, AuthApi
src/app/core/interceptors  errorInterceptor (outer) -> authInterceptor (inner, single-flight refresh)
src/app/core/guards     authGuard, guestGuard, roleGuard(...roles), homeRedirect
src/app/core/models     DTO mirrors + enums (one file per feature, barrel index.ts)
src/app/core/notify     ToastService (MatSnackBar)
src/app/core/util       idempotency, file download (base64 -> Blob), UTC date parsing, cooldown (rate-limit countdown persisted in sessionStorage)
src/app/layout          ShellComponent (role-based sidenav), AuthLayoutComponent, nav config
src/app/shared          reusable UI/pipes: forms/ (validators mirroring backend rules incl. notBlank + PHOTO_RULES/validatePhotoFile, fieldError, applyServerErrors/setServerError, PasswordRulesComponent), ui/ (FormAlertComponent, ConfirmDialogComponent + confirmDialog(), initialsOf)
src/app/features/<x>    feature pages + <x>.api.ts typed service
```

## Backend conventions (verified from code)
- Envelope: every response is `{ message, result, isSuccess, statusCode }` (camelCase); payload is in **`result`**.
- Enums serialized as **names** (PascalCase): `GEL|USD|EUR|GBP`; AccountStatus `Active|Frozen|Closed`; TransferStatus `Pending|Completed|Failed|Cancelled`; EntryType `Debit|Credit`; TransferDirection `Outgoing|Incoming`; VirtualCardStatus `Active|Frozen|Closed|Expired`; SimulatedPaymentStatus `Pending|Completed|Failed`; PaymentDeclineReason `CardNotActive|CardExpired|AccountNotActive|TransactionLimitExceeded|DailyLimitExceeded|InsufficientFunds|CurrencyMismatch`; SuspiciousActivityStatus `Detected|UnderReview|Resolved`; RiskLevel `Low|Medium|High` (<30, <60, ≥60).
- Dates are UTC but serialized **without `Z`** → always parse via `parseUtc()` / `utcDate` pipe.
- Amounts: max 2 decimals.
- **204 responses: treat as success with no body. Never rely on a body.**
- Paging params always `pageNumber`, `pageSize` (max 100). Four response shapes (normalized by `ApiClient.getPaged`): `{items,totalCount}`, `{items,totalcount}` (conversions), `{items,totalCount,pageNumber,pageSize}` (admin users), `PaginatedResult` with `totalPages` (cards, payments, manager).
- Date filters: `toDate` is inclusive (server adds 1 day) on statement, conversions, audit, manager lists. **Analytics `toDate` is exclusive** and both dates are required.
- Roles: `Customer`, `Manager`, `Admin`. Customer-only controllers return 403 for Manager/Admin.

## Endpoints (`/api/...`)
**auth** (anonymous unless noted)
- `POST auth/register` `{firstName,lastName,email,personalNumber(11 digits),phoneNumber(+995XXXXXXXXX),password}` → userId (201)
- `POST auth/register-manager`, `POST auth/register-admin` (**Admin**) same body
- `POST auth/confirm-email` `{email,code}` (6 digits, 5 min) · `GET auth/resend-confirmation-code?email=` (1/60s, 5/h)
- `POST auth/login` `{userName: <email>, password}` → `{accessToken,refreshToken}`
- `POST auth/refresh-token` body = **raw JSON string** → new pair (rotation: old token deleted). Invalid → **400**.
- `POST auth/forgot-password` body = raw JSON string email · `POST auth/reset-password` `{email,token,newPassword}`
- `POST auth/revoke-token` body = raw JSON string refresh token (400 if already gone → ignore)

**profile** (any authenticated): `GET profile` → ProfileDto · `PATCH profile?firstName&lastName&phoneNumber` (**query params**, no body; at least one; names non-blank ≤100; phone `+995XXXXXXXXX`, cannot be cleared; duplicate → 400 "This phone number is already in use") → ProfileDto · `PUT profile/photo` multipart field `file` (JPEG/PNG/WebP by magic bytes, ≤ 2 × 1024 × 1024 bytes; Cloudinary, resized 256×256) → `{photoUrl}` · `DELETE profile/photo` (204; also succeeds with no photo)

**account** (Customer): `GET account` → AccountForGettingDto[] (owner adds `id`) · `GET account/{no}` · `GET account/{no}/statement?from&to&pageNumber&pageSize(15)` → `{items,totalCount}` · `POST account?currency=&name=` (query params, max 5 open) → `{accountNumber,createdAt}` · `POST account/{no}/close` (balance 0) · `PATCH account/{no}/name` `{name}` (1–50) · `POST account/{no}/deposit` header `Idempotency-Key`(≤50) body `{amount}` (0.01–10,100) · `GET account/analytics?fromDate&toDate`

**transfers** (Customer): `GET transfers?pageNumber&pageSize` → `{items: MyTransferDto[], totalCount}` (no filters) · `GET transfers/{id}` → TransferDto · `POST transfers/recipients/lookup` `{personalNumber}` → `[{accountId,maskedAccountNumber,currency}]` (rate limited 1/s, 20/10min) · `POST transfers/by-account-number` header `Idempotency-Key`(≤100) `{fromAccountNumber,toAccountNumber,amount(≤1,000,000),description?(≤500)}` · `POST transfers/by-recipient` header key `{fromAccountNumber,toAccountId,amount,description?}` · `GET transfers/{id}/receipt`

**conversions** (Customer): `POST conversions/quote` `{fromAccountNumber,toAccountNumber,amount}` · `POST conversions` header `Idempotency-Key` `{fromAccountNumber,toAccountNumber,amount,expectedRate?}` (409 "The exchange rate has changed…" → re-quote) · `GET conversions?fromDate&toDate&fromCurrency&toCurrency&pageNumber&pageSize` · `GET conversions/{id}/receipt`. Fee 0.5% taken from source amount. NBG down → 503.

**card** (Customer, singular): `POST card` `{bankAccountId,name(≤50),dailyLimit,transactionLimit}` (txn ≤ daily ≤ 100,000) → VirtualCardCreatedDto (**full cardNumber shown only once**) · `GET card?pageNumber&pageSize` (**always send both**) · `GET card/{id}` · `PATCH card/{id}/limits` · `PATCH card/{id}/freeze|unfreeze|close`

**payments** (Customer): `POST payments` `{virtualCardId,amount,merchant(≤100),description?,idempotencyKey}` (key in **body**). Declines are 200 with `status: Failed` + `failureReason`. · `GET payments?…` · `GET payments/{id}` · `GET payments/card/{cardId}?…` · `GET payments/{id}/receipt`

**recipient** (Customer): `GET recipient` · `POST recipient` `{name,accountNumber}` · `PUT recipient/{id}` `{name}` · `DELETE recipient/{id}`

**manager** (Manager or Admin): `GET manager/dashboard` · `GET manager/transfers?status&accountNumber&fromDate&toDate&paging` · `GET manager/transfers/{id}` (unknown id → 200 with null) · `GET manager/accounts?accountNumber&userId&status&currency&paging` · `GET manager/accounts/{id}` · `GET manager/accounts/{id}/transactions?type&fromDate&toDate&paging` · `GET manager/currency-conversions?userId&accountNumber&fromCurrency&toCurrency&fromDate&toDate&paging` · `GET manager/currency-conversions/{id}` · `GET manager/suspicious-activities?status&riskLevel&userId&fromDate&toDate&paging` · `GET manager/suspicious-activities/{id}` · `PATCH manager/{id}/review` (Detected→UnderReview) · `PATCH manager/{id}/resolve` (UnderReview→Resolved)

**admin** (Admin): `GET admin/actions` → string[] · `GET admin/audit-logs?userId&action&entityName&entityId&ipAddress&fromDate&toDate&paging(20)` · `PATCH admin/{accountNumber}/freeze|unfreeze` · `GET admin/users?search&paging` · `GET admin/user/{userId}` (singular; bankAccounts use string currency/status) · `PATCH admin/users/{userId}/ban|unban`

**Receipts** come as JSON: `result = { fileContents: <base64>, contentType, fileDownloadName }` → decode with `core/util/download.ts`.

## Auth flow
- Login with email as `userName`. JWT claims: `sub`, `email`, `role` (string or array), `exp`. Name/photo come from `GET profile`.
- Access token 15 min (**memory only**); refresh token 7 days (**sessionStorage**). On app start, a stored refresh token restores the session.
- Refresh is single-flight (one request in flight; others wait). Rotation means a reused token fails.
- 401 on an authenticated request → refresh once → retry; refresh failure → clear session → `/login?returnUrl=`. 401/403 from JWT middleware have **empty bodies**. 403 → toast/forbidden page, no logout.
- Logout → `revoke-token` (ignore errors) → clear → `/login`.
- Login errors: 404/400 → generic "Invalid email or password", **except** "Email is not confirmed." (→ confirm page) and locked/banned messages (show as-is). Matching lives in `core/api/error-messages.ts`.
- Password policy (Identity): ≥10 chars, upper, lower, digit, symbol. Phone `+995XXXXXXXXX`. Personal number 11 digits.
- **Reset password**: `/forgot-password` = email only, POST as raw JSON string (404 if unknown email; rate limit 1/60 s, 5/h, same message prefix as resend). Email link (AuthService.ForgotPasswordAsync): `{AppSettings:FrontendBaseUrl}/reset-password?email=<Uri-escaped email>&token=<Base64Url token, Uri-escaped>`. `/reset-password` reads `email` and `token` once (component input binding; the router has already decoded them, so the token is sent exactly as read, no extra decode/encode), keeps them in signals, then clears the query string (`router.navigate([], { replaceUrl: true, queryParams: {} })`). The form has only newPassword + confirmPassword (with PasswordRulesComponent) and shows the masked email (`i***@gmail.com`). No manual entry of email/token. States: missing email or token, or 404 → "This reset link is invalid or incomplete."; 400 "Invalid reset token." / Identity "Invalid token." (`isInvalidResetToken`) → "This link has expired or was already used."; both offer "Request a new link" (`/forgot-password`). Success → message, then `/login?email=` after 2.5 s. While the page is open it adds `<meta name="referrer" content="no-referrer">` (Angular `Meta`, removed on destroy). Body: `{email, token, newPassword}`.
- **Confirm email**: the confirmation email links to `{FrontendBaseUrl}/confirm-email?email=`; the page prefills email. Registration sends the first code; resend is limited 1/60 s and 5/h (400 "Please wait before requesting another …"). The UI starts a 60 s cooldown after register, resend and a rate-limit error.
- Pages pass `{ silent: true }` and show errors inline (FormAlert or field `server` errors), never as toasts. Unconfirmed login → `/confirm-email?email=` with navigation state `reason`. After login: `safeReturnUrl(returnUrl)` (internal paths only) or the role home.
- Profile for the user menu: `AuthService.ensureProfile()` (deduplicated) after login, after restore, and when the shell opens.
- **Profile page** (`features/profile`, `/profile`, all roles): `ProfileApi` (update/setPhoto/deletePhoto); GET goes through `AuthService.loadProfile()`. The page reads and writes `AuthService.profile` (`setProfile`), so the shell menu updates immediately. Edit sends only changed fields (phone typed as 9 digits after a fixed `+995`; phone required only if one is already set). Server messages map to fields via `profileFieldError` (error-messages.ts). Photo: client check (type + size) → local preview (object URL) → "Save photo" uploads; remove asks via `confirmDialog`. No change-password UI (no endpoint).

## Error handling
- Exception responses: CommonResponse with `message` (404, 400, 405, 401, 409, 503, and **500 for domain-rule errors**, still meaningful messages).
- Model validation: ValidationProblemDetails `{title, status, errors: {Field: [msgs]}}`.
- `ApiError` normalizes both; the error interceptor toasts unless the request sets `SILENT_ERROR`. Generic fallbacks for 500/409 when the message is empty or a default .NET text.

## Special requirements
- Idempotency: `newIdempotencyKey()` (UUID) per user intent; reuse on retry/double-click; regenerate after success or when inputs change.
- `rowVersion` is not exposed; concurrency shows as 409 → generic message.
- Statement export: **client-side CSV** (fetch all pages for the range). No PDF.
- Hidden for now (no backend): change password, scheduled transfers, transfer filters, role changes, manager user search, ban status in user list.

## Role → screens
- Customer (home `/dashboard`): dashboard, accounts, transfers, recipients, conversions, cards/payments, analytics, profile.
- Manager (home `/manager`): dashboard, transfers, accounts, conversions, suspicious activities, profile.
- Admin (home `/manager`): all manager screens + users (ban/unban), create staff (manager/admin), freeze/unfreeze accounts, audit logs.

## Commands
- `npm start` (ng serve with proxy, backend must run on :8080) · `npx ng build` · `npx ng test --watch=false --browsers=ChromeHeadless`
