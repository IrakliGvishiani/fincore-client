# FinCore Client — Frontend Walkthrough (დაცვისთვის)

ეს დოკუმენტი არის კითხვის გეგმა: რა თანმიმდევრობით გავიარო კოდი, რომ დაცვაზე ყველაფერი ავხსნა.
ტექსტი ქართულია, ტექნიკური ტერმინები ინგლისურად დავტოვე (როგორც კოდშია).

**მოკლედ პროექტზე:** FinCore არის ციფრული ბანკის სიმულატორი. ეს რეპო არის მხოლოდ **Angular 19** frontend.
Backend (ASP.NET Core) ცალკე რეპოშია. Browser ყოველთვის ერთ origin-ს ელაპარაკება: dev-ში `ng serve` proxy
(`proxy.conf.json`), production-ში nginx (`nginx/default.conf`) გადასცემს `/api`-ს backend-ს, ამიტომ CORS არ გვჭირდება.

**ძირითადი პრინციპები, რომლებიც ყველგან მეორდება:**
- standalone components + **signals** (NgModule-ები არ გვაქვს);
- ყველა გვერდი **lazy** იტვირთება (`loadComponent` / `loadChildren`);
- ერთი HTTP client wrapper (`ApiClient`), ერთი error model (`ApiError`), ერთი ადგილი message-ების დამუშავებისთვის (`error-messages.ts`);
- backend-ის წესები client-ზეც მეორდება (validators), მაგრამ საბოლოო გადაწყვეტილება ყოველთვის server-ისაა.

---

## 1. აპლიკაციის გაშვება (startup)

### ფაილები
| ფაილი | რას აკეთებს |
|---|---|
| `src/index.html` | `<app-root>`-ში არის სტატიკური "Loading FinCore…" spinner. ის ჩანს, სანამ Angular პირველ გვერდს დახატავს. |
| `src/main.ts` | `bootstrapApplication(AppComponent, appConfig)`: აპის გაშვება NgModule-ის გარეშე. |
| `src/app/app.config.ts` | ყველა global provider: router, HttpClient + interceptors, animations, `TitleStrategy`, Material-ის default-ები და `provideAppInitializer(() => AuthService.restoreSession())`. |
| `src/app/app.routes.ts` | ყველა route. თითოეული გვერდი `loadComponent`-ით ან `loadChildren`-ით (lazy). |
| `src/app/features/*/…routes.ts` | დიდი ნაწილების route-ები: `manager.routes.ts`, `admin.routes.ts`, `demo-shop.routes.ts`. |
| `src/app/layout/shell/*` | შესული მომხმარებლის layout: sidenav (role-ის მიხედვით, `layout/nav.ts`), toolbar, user menu. |
| `src/app/layout/auth-layout/*` | login/register-ის ბარათის layout. |
| `src/app/features/landing/*` | `/` გვერდი სტუმრისთვის (landing page). |
| `src/app/core/title-strategy.ts` | ბრაუზერის tab-ის სათაური "Page · FinCore". |

### როგორ მუშაობს
1. `main.ts` უშვებს `AppComponent`-ს `appConfig`-ით.
2. `provideRouter(...)` არის `withComponentInputBinding()`-ით (route param-ები და query param-ები პირდაპირ component-ის `input()`-ებში შედის), `withInMemoryScrolling` და `withEnabledBlockingInitialNavigation()` (bootstrap ელოდება პირველ navigation-ს, ამიტომ ეკრანზე spinner რჩება და ცარიელი გვერდი არ ჩანს).
3. App initializer იწყებს **session restore**-ს: access token მხოლოდ memory-შია, ამიტომ F5-ის შემდეგ შენახული refresh token-ით ახალ token-ს ვიღებთ.
4. **მნიშვნელოვანი:** Angular app initializer-ებს **პარალელურად** უშვებს, ხოლო blocking navigation-იც ერთ-ერთ initializer-ში იწყება. ამიტომ ყველა guard ჯერ ელოდება `AuthService.whenSessionReady()`-ს, მერე წყვეტს. ამის გარეშე F5-ზე შესული მომხმარებელი `/login`-ზე გადადიოდა (ეს bug გვქონდა და გამოვასწორეთ, test-იც დავწერეთ).
5. Route-ების სტრუქტურა (`app.routes.ts`, თანმიმდევრობა მნიშვნელოვანია):
   - `''` + `canMatch: guestOnlyMatch` → landing page (მხოლოდ სტუმრისთვის);
   - auth layout (`login`, `register`, `confirm-email`, `forgot-password`, `reset-password`, `session-unavailable`); აქ არის `canMatch: nonEmptyUrlMatch`, რომ `/`-ზე ცარიელი ბარათი არ გამოჩნდეს;
   - `demo-shop` (საკუთარი layout, shell-ის გარეშე);
   - shell (`authGuard`), შიგნით Customer-ის გვერდები (`roleGuard('Customer')`), `manager` (`roleGuard('Manager','Admin')`), `admin` (`roleGuard('Admin')`);
   - `**` → Not found.
6. `/` შესულ მომხმარებელზე: landing არ ემთხვევა, shell-ის `'' → homeRedirect` აგზავნის Customer-ს `/dashboard`-ზე, Manager/Admin-ს `/manager`-ზე.

### რატომ ასე
- **Lazy loading:** საწყისი bundle პატარაა (~190 kB gzip). Chart.js იტვირთება მხოლოდ analytics და manager dashboard-ზე (`@defer`).
- **Standalone + signals:** Angular 19-ის რეკომენდებული მიდგომაა, ნაკლები boilerplate, change detection-იც მარტივია (`OnPush` + signals).
- **Guards ელოდება restore-ს:** startup-ის თანმიმდევრობა არ არის დამოკიდებული timing-ზე, ამიტომ ქცევა deterministic-ია.

### შესაძლო კითხვები
1. **რატომ არ გაქვთ NgModule-ები?** Angular 19-ში standalone components სტანდარტია: თითოეული component თავის imports-ს თვითონ აცხადებს, lazy loading `loadComponent`-ით მარტივია და bundle-ის tree-shaking უკეთესია.
2. **რა ხდება F5-ზე?** Access token memory-შია და იკარგება. App initializer შენახული refresh token-ით იღებს ახალ token-ს; guard-ები ამას ელოდება და მომხმარებელი იმავე URL-ზე რჩება (deep link-ებიც). თუ refresh token უარყოფილია (400/401), `/login`-ზე გადავდივართ; თუ server მიუწვდომელია, `/session-unavailable` გვერდზე (Try again).
3. **როგორ არ ხედავს Manager Customer-ის გვერდებს?** სამი დონე: sidenav აჩვენებს მხოლოდ role-ის სექციებს (`nav.ts`), route-ებზე არის `roleGuard`, login-ის შემდეგ `returnUrlForRoles()` აგდებს returnUrl-ს, რომელსაც role ვერ გახსნის. ბოლოს backend-იც აბრუნებს 403-ს.

---

## 2. Request-ის გზა: ApiClient, CommonResponse, paging

### ფაილები
| ფაილი | რას აკეთებს |
|---|---|
| `src/app/core/api/api-client.ts` | `get/post/put/patch/delete`, `getPaged`, `getFile`, `postJsonString`, `upload`; `unwrap()` და `normalizePaged()`. |
| `src/app/core/api/http-context.ts` | `SILENT_ERROR` და `SKIP_AUTH` (HttpContextToken-ები). |
| `src/app/core/models/*` | DTO-ების TypeScript ასლები (`common.ts`: `ApiResponse<T>`, `Paged<T>`, `PageQuery`). |
| `src/app/features/<x>/<x>.api.ts` | თითო feature-ის typed service (მაგ. `transfers.api.ts`). |
| `src/app/core/util/download.ts` | receipt-ის base64 → Blob → ფაილის ჩამოტვირთვა. |
| `src/app/core/util/date.ts` | `parseUtc()`: backend თარიღს `Z`-ის გარეშე აგზავნის, ჩვენ UTC-დ ვკითხულობთ. |

### როგორ მუშაობს
1. Component იძახებს feature service-ს, მაგ. `TransfersApi.list(1, 10, { silent: true })`.
2. Service იძახებს `ApiClient`-ს. `ApiClient` აწყობს URL-ს (`environment.apiBaseUrl` = `/api`), query params-ს (null და '' ქრება, Date ხდება `yyyy-MM-dd`), header-ს `Idempotency-Key` (თუ საჭიროა) და `HttpContext`-ს (`silent`, `skipAuth`).
3. Backend ყოველთვის აბრუნებს **CommonResponse envelope**-ს: `{ message, result, isSuccess, statusCode }`. `unwrap()` აბრუნებს მხოლოდ `result`-ს, ამიტომ component-ები მუშაობენ სუფთა DTO-ებით.
4. 204 (body-ს გარეშე) → `null` → `undefined`. ამიტომ 204-იან endpoint-ებზე body-ს არასოდეს ვენდობით.
5. **Paging adapter** (`getPaged` + `normalizePaged`): backend-ს ოთხი სხვადასხვა paged ფორმა აქვს:
   - `{items, totalCount}` (transfers, statement),
   - `{items, totalcount}` — პატარა `c` (conversions),
   - `{items, totalCount, pageNumber, pageSize}` (admin users),
   - `PaginatedResult` `totalPages`-ით (cards, payments, manager).
   ყველა გარდაიქმნება ერთ `Paged<T>`-ად `{items, totalCount, pageNumber, pageSize, totalPages}`. Paginator-ს და გვერდებს ერთი ფორმა ჭირდებათ.
6. URL-ზე დამოკიდებული სიებისთვის (manager/admin) არის `shared/filters/url-paged-list.ts`: filter-ები და გვერდი ცხოვრობს query string-ში (გვერდი reload-ზე და share-ზე იგივე რჩება), ჩატვირთვა ხდება effect-ით.

### რატომ ასე
- **ერთი wrapper:** envelope-ის გახსნა, error-ის ნორმალიზაცია და headers ერთ ადგილზეა. Feature service-ებში HttpClient-ის კოდი არ მეორდება.
- **Paging adapter:** backend-ის შეუსაბამობები client-ის ერთ ფუნქციაშია დამალული და UI მათზე არ არის დამოკიდებული.
- **Typed services:** endpoint-ის URL და მისი წესები (comments-ში) ერთ ადგილზეა, component-ებში string URL-ები არ წერია.

### შესაძლო კითხვები
1. **რა მოხდება, თუ backend-ი paging-ის ფორმას შეცვლის?** იცვლება მხოლოდ `normalizePaged()`. Component-ები ყოველთვის `Paged<T>`-ს იღებენ.
2. **რატომ `/api` relative URL?** Production-ში nginx ერთ origin-ზე ემსახურება SPA-საც და API-საც, ამიტომ CORS და სხვადასხვა URL-ები არ გვჭირდება. Build-ში `localhost` არსად რჩება.
3. **როგორ ჩამოგაქვთ PDF receipt?** Backend აბრუნებს `FileContentResult`-ს JSON-ში (base64). `download.ts` აქცევს Blob-ად და დროებითი `<a download>`-ით ინახავს; object URL მერე თავისუფლდება.

---

## 3. Authentication: AuthService, token storage, interceptors, guards

### ფაილები
| ფაილი | რას აკეთებს |
|---|---|
| `src/app/core/auth/auth.service.ts` | session-ის state (signals): `isAuthenticated`, `roles`, `profile`; `login`, `logout`, `refresh` (single-flight), `restoreSession`, `whenSessionReady`, `expireSession`. |
| `src/app/core/auth/token-storage.ts` | refresh token **sessionStorage**-ში (try/catch-ით). |
| `src/app/core/auth/jwt.ts` | JWT payload-ის decode (verify-ის გარეშე: ეს server-ის საქმეა): `sub`, `email`, `role`, `exp`. |
| `src/app/core/auth/auth.api.ts` | `/auth/*` endpoint-ები (`login`, `refresh-token`, `revoke-token`, register…). |
| `src/app/core/interceptors/auth.interceptor.ts` | Bearer token-ის დამატება, 401 → refresh → ერთხელ retry. |
| `src/app/core/interceptors/error.interceptor.ts` | HttpErrorResponse → `ApiError`, toast (თუ request `silent` არ არის). |
| `src/app/core/guards/auth.guards.ts` | `authGuard`, `guestGuard`, `roleGuard(...)`, `homeRedirect`, `guestOnlyMatch`, `nonEmptyUrlMatch`. |
| `src/app/core/auth/return-url.ts` | `safeReturnUrl()` (open redirect-ისგან დაცვა), `returnUrlForRoles()`. |
| `src/app/features/auth/*` | login, register, confirm-email, forgot/reset password, session-unavailable გვერდები. |

### როგორ მუშაობს
- **Token-ები:** access token (15 წთ) მხოლოდ **memory**-ში (signal); refresh token (7 დღე) **sessionStorage**-ში. "Authenticated" = access token არის შენახული. Profile (სახელი, ფოტო) მერე იტვირთება და guard-ზე გავლენა არ აქვს.
- **Interceptor-ების რიგი:** `errorInterceptor` (გარე) → `authInterceptor` (შიდა). ამიტომ auth interceptor-ი "ნედლ" 401-ს ხედავს და ჯერ refresh + retry-ს ცდის; error interceptor-ი 401-ზე toast-ს არ აჩვენებს.
- **Single-flight refresh:** `AuthService.refresh()` ინახავს მიმდინარე request-ს (`shareReplay`). თუ 3 request ერთად მიიღებს 401-ს, refresh-token გაიგზავნება **ერთხელ** და სამივე იმავე პასუხს ელოდება. ეს აუცილებელია, რადგან backend **rotation** აკეთებს: ძველი refresh token პირველივე გამოყენებისას იშლება და ორი პარალელური refresh ერთმანეთს გააუქმებდა.
- **ვადაგასული token-ი წინასწარ:** თუ access token მალე იწურება, interceptor-ი request-მდე აკეთებს refresh-ს.
- **Session-ის დასრულება:** session იშლება მხოლოდ მაშინ, როცა refresh უარყოფილია (400/401, `isRefreshRejection`), მაგ. ვადა გავიდა ან admin-მა მომხმარებელი დაბლოკა. მაშინ `expireSession()`: session იშლება, ერთხელ ჩანს toast "Your session has ended…" და ხდება გადასვლა `/login?returnUrl=`-ზე. ის **ერთხელ** ხდება session-ზე, ამიტომ პარალელური 401-ები მეორე toast-ს არ იწვევს. Network/5xx შეცდომაზე session რჩება.
- **Guards:** ყველა ჯერ `await auth.whenSessionReady()`, მერე ამოწმებს `isAuthenticated()` / `hasAnyRole()`. სტუმარი → `/login?returnUrl=`, არასწორი role → `/forbidden`. 403 მომხმარებელს **არ** აგდებს.
- **Logout:** `revoke-token` (შეცდომას ვაიგნორებთ) → session-ის წაშლა → `/login`.

### რატომ ასე
- **Access token memory-ში:** XSS-ის შემთხვევაში localStorage-დან token-ის მოპარვა უფრო მარტივია; memory-ში ის ტაბის დახურვით ქრება. Refresh token sessionStorage-შია, რომ F5-მა session არ დაკარგოს და ტაბის დახურვისას ის მაინც წაიშალოს. (HttpOnly cookie უკეთესი იქნებოდა, მაგრამ backend refresh token-ს body-ში იღებს.)
- **Single-flight:** backend-ის rotation-ის გამო ორი პარალელური refresh session-ს გააფუჭებდა.
- **Interceptor-ი, და არა თითო გვერდში ლოგიკა:** token-ის დამატება და refresh ერთ ადგილზეა, გვერდებმა ამის შესახებ არაფერი იციან.

### შესაძლო კითხვები
1. **რატომ არ ინახავთ access token-ს localStorage-ში?** XSS-ის რისკის გამო: memory-ში ის ნაკლებად ხელმისაწვდომია და მოკლევადიანია (15 წთ). F5-ზე მას თავიდან ვიღებთ refresh token-ით.
2. **რა ხდება, თუ 5 request ერთად მიიღებს 401-ს?** ერთი refresh-token request იგზავნება, ხუთივე მის შედეგს ელოდება და ახალი token-ით ერთხელ მეორდება. თუ refresh უარყოფილია, logout ხდება ერთხელ, ერთი toast-ით (`session-end.spec.ts` ამას ამოწმებს).
3. **დაბლოკილ მომხმარებელს რა ემართება, თუ უკვე შესულია?** Backend მის access token-ს 401-ით უარყოფს, refresh აბრუნებს 400-ს და client აკეთებს logout-ს, მაგრამ უსასრულო ციკლის გარეშე, რადგან refresh-token request-ზე თავად აქვს `skipAuth`.

---

## 4. Error handling და idempotency keys

### ფაილები
| ფაილი | რას აკეთებს |
|---|---|
| `src/app/core/api/api-error.ts` | `ApiError`: ერთი ფორმა ყველა შეცდომისთვის (`status`, `message`, `serverMessage`, `fieldErrors`; `isNetworkError`, `isNotFound`, `isConflict`…). |
| `src/app/core/api/error-messages.ts` | **ყველა** message-ის დამთხვევა ერთ ადგილზე: `transferErrorMessage`, `conversionErrorMessage`, `paymentErrorMessage`, `loginErrorMessage`, `registrationFieldError`… |
| `src/app/core/interceptors/error.interceptor.ts` | toast, თუ request `silent` არ არის. |
| `src/app/shared/forms/server-errors.ts` | `applyServerErrors()`: server-ის validation errors → form field-ები. |
| `src/app/shared/ui/form-alert.component.ts`, `state-panel.component.ts` | inline შეცდომა / loading / empty / error state + "Try again". |
| `src/app/core/util/idempotency.ts` | `newIdempotencyKey()` (UUID) და `IdempotencyKeyHolder`. |

### როგორ მუშაობს — errors
- Backend-ი აბრუნებს ორ ფორმას: CommonResponse `message`-ით, ან ASP.NET-ის `ValidationProblemDetails` (`errors: {Field: [...]}`). `ApiError.from()` ორივეს ერთ ფორმად აქცევს.
- გვერდები იძახებენ `{ silent: true }`-ით და შეცდომას აჩვენებენ **inline** (form-ის ველთან ან alert-ში). Toast რჩება მხოლოდ ზოგადი ქმედებებისთვის.
- ზოგადი .NET ტექსტების ან ცარიელი message-ის შემთხვევაში ვაჩვენებთ ადამიანურ ტექსტს (`isTechnicalMessage`).
- **"შეიძლება უკვე შესრულდა":** ფულის ოპერაციებზე 409, network error ან გაურკვეველი 5xx ნიშნავს, რომ არ ვიცით, შესრულდა თუ არა. მაშინ ვწერთ "may already have gone through, check history" და ვაძლევთ ისტორიის ბმულს, ნაცვლად იმისა, რომ ვთქვათ "ვერ შესრულდა".

### როგორ მუშაობს — idempotency
- ფულის ოპერაციები (deposit, transfer, conversion, card payment) აგზავნის **Idempotency-Key**-ს (UUID). Transfer, deposit და conversion-ისთვის ის header-შია, payment-ისთვის body-ში (backend-ის contract).
- `IdempotencyKeyHolder.keyFor(payload)`: სანამ payload იგივეა, key-იც იგივეა (retry, double-click, network error). Payload შეიცვალა (თანხა, ანგარიში) → ახალი key. წარმატების შემდეგ `reset()`.
- Server-ზე: იგივე key + იგივე payload → აბრუნებს **იმავე** ოპერაციას (ორჯერ არ ჩამოიჭრება); იგივე key + სხვა payload → 409.
- Card payment-ზე key ახლდება ნებისმიერი 200-ის შემდეგ, უარყოფის (Failed) შემდეგაც, რადგან backend უარყოფასაც ინახავს და იგივე key იგივე უარყოფას დააბრუნებდა.
- Conversion-ზე key იგივე რჩება rate-ის ცვლილების (409) შემდეგაც, რადგან server rate-ს key-მდე ამოწმებს.

### რატომ ასე
- **ერთი error ფორმა + ერთი message ფაილი:** backend-ის ტექსტების დამთხვევა (prefix-ით) ერთ ადგილზეა. თუ backend ტექსტს შეცვლის, ვასწორებთ ერთ ფაილს.
- **Idempotency:** ბანკში ყველაზე საშიში შეცდომა ორჯერ ჩამოჭრაა. Network-ის გაწყვეტის შემდეგ მომხმარებელი "Try again"-ს დააჭერს, ამიტომ retry უსაფრთხო უნდა იყოს.

### შესაძლო კითხვები
1. **რა მოხდება, თუ Confirm-ს ორჯერ დავაჭერ?** ღილაკი request-ის დროს disabled-ია, და მაინც ორივე request-ს ერთი key ექნებოდა, ამიტომ server-ი მეორეზე იმავე transfer-ს დააბრუნებს.
2. **როდის იცვლება key?** როცა იცვლება ის, რასაც ვაგზავნით (payload fingerprint), ან ოპერაცია წარმატებით დასრულდა. Retry-ზე key არ იცვლება.
3. **რატომ არ აჩვენებთ ყველა შეცდომას toast-ით?** ფორმის შეცდომა ველთან უფრო გასაგებია (მაგ. "Insufficient funds" ან duplicate email), toast კი ქრება. Toast რჩება მხოლოდ იქ, სადაც გვერდს inline ადგილი არ აქვს.

---

## 5. ერთი feature ბოლომდე: Transfers

### ფაილები
| ფაილი | რას აკეთებს |
|---|---|
| `src/app/features/transfers/transfers.api.ts` | `list`, `get`, `lookupRecipient`, `byAccountNumber`, `byRecipient`, `downloadReceipt`; `TRANSFER_LIMITS`. |
| `src/app/features/transfers/transfers-list-page.component.*` | `/transfers`: ისტორიის ცხრილი (მიმართულება, ფერი + ნიშანი, status badge, paginator). |
| `src/app/features/transfers/transfer-detail-page.component.*` | `/transfers/:id`: დეტალები + PDF receipt. |
| `src/app/features/transfers/new-transfer/new-transfer-page.component.*` | `/transfers/new`: ფორმა, recipient-ის ძიება, შედეგის ეკრანი. |
| `src/app/features/transfers/new-transfer/transfer-form.ts` | pure logic: `createTransferForm`, `applyMode`, `transferRulesValidator`, `buildDraft`, `draftFingerprint`, `parseToParam`. |
| `src/app/features/transfers/new-transfer/transfer-review-dialog.component.ts` | Review dialog, რომელიც request-ს აგზავნის. |
| `src/app/shared/pipes/account-number.pipe.ts` | masked ნომერი `•••• 1234`. |

### ნაბიჯ-ნაბიჯ
1. **გვერდის გახსნა:** იტვირთება მომხმარებლის Active ანგარიშები (source). `?from=` წინასწარ ირჩევს ანგარიშს, `?to=` ავსებს მიმღების ნომერს (Saved recipients-იდან "Send money").
2. **ორი რეჟიმი:** *Account number* (ნომრით) და *Personal number* (პირადი ნომრით → "Find accounts" → `recipients/lookup`, აბრუნებს **masked** ანგარიშებს). Lookup-ზე client-ი იცავს backend-ის rate limit-ს (3 წამი ძიებებს შორის, 60 წამი rate-limit message-ის შემდეგ).
3. **Validation (client):** თანხა 0.01–1,000,000, 2 ათწილადი; იგივე ანგარიშზე გადარიცხვა აკრძალულია; ვალუტების შეუსაბამობა (თუ ცნობილია); description ≤ 500. ბალანსზე მეტი თანხა მხოლოდ **გაფრთხილებაა**: საბოლოოდ server წყვეტს.
4. **Review:** "Continue" ხსნის review dialog-ს. აქ იქმნება key: `IdempotencyKeyHolder.keyFor(draftFingerprint(draft))`. Dialog-ი აჩვენებს თანხას, საიდან, სად და აღწერას.
5. **Confirm:** `POST transfers/by-account-number` ან `by-recipient` + `Idempotency-Key` header. Confirm request-ის დროს disabled-ია.
6. **შეცდომები:** dialog-ი რჩება ღია. "Try again" იგივე key-ით მეორდება; 409/network/გაურკვეველი 5xx → "may already have gone through" + ისტორიის ბმული (`transferErrorMessage`).
7. **წარმატება:** key-ის `reset()`, ანგარიშების ხელახლა ჩატვირთვა, შედეგის ეკრანი (status, თანხა, from, **masked** to). ღილაკები: View details, Download receipt, New transfer, "Save this recipient" (თუ ნომრით გადარიცხვა იყო და ნომერი შენახული არ არის).
8. **ისტორია და detail:** paged სია `normalizePaged`-ით; detail-ზე PDF receipt `download.ts`-ით.

### რატომ ასე
- **Pure logic ცალკე ფაილში (`transfer-form.ts`):** ფორმის წესები ტესტდება DOM-ის გარეშე, component კი მხოლოდ UI-ს მართავს.
- **Review dialog-ი თვითონ აგზავნის request-ს:** შეცდომისას dialog ღია რჩება და "Try again" მარტივია; key გვერდზე ინახება, რომ dialog-ის დახურვამ და ხელახლა გახსნამაც იგივე key გამოიყენოს.
- **Masking:** backend მიმღების ნომერს მასკავს; UI ამას პატივს სცემს (`•••• 1234`) და masked ნომრისთვის copy ღილაკს მალავს.

### შესაძლო კითხვები
1. **რატომ არის ბალანსის შემოწმება მხოლოდ გაფრთხილება?** ბალანსი შეიძლება შეიცვალოს გვერდის ჩატვირთვის შემდეგ, ამიტომ წყაროდ server რჩება. Client-ის ამოცანაა მომხმარებლის დახმარება, არა წესის დადგენა.
2. **რა ხდება, თუ network გაწყდა Confirm-ის შემდეგ?** ვაჩვენებთ "შეიძლება უკვე შესრულდა"-ს ისტორიის ბმულით. "Try again" იგივე key-ით მეორდება, ამიტომ თუ პირველი უკვე შესრულდა, server-ი იმავე transfer-ს აბრუნებს და ფული ორჯერ არ ჩამოიჭრება.
3. **პირადი ნომრით ძიება რატომ აბრუნებს masked ნომრებს?** Privacy-ის გამო: სხვისი სრული ანგარიშის ნომერი არ უნდა გამოჩნდეს. Transfer იგზავნება `toAccountId`-ით (`by-recipient`), ამიტომ სრული ნომერი არც გვჭირდება.

---

## 6. Shared components

### ფაილები (`src/app/shared/`)
| ნაწილი | რისთვის |
|---|---|
| `ui/state-panel.component.ts` | loading / error / empty ერთი component-ით (+ "Try again" slot). |
| `ui/skeleton.component.ts` | loading placeholder (dashboard, analytics). |
| `ui/form-alert.component.ts` | inline error / info / success ფორმებში. |
| `ui/confirm-dialog.component.ts` | `confirmDialog()`: ყველა დადასტურება (close, ban, freeze, delete…). |
| `ui/status-badge.component.ts` | ფერადი badge ყველა status-ისთვის (Active, Frozen, Detected, High, Banned…). |
| `ui/copy-button.component.ts`, `avatar.component.ts`, `user-ref.component.ts`, `user-filter-chip.component.ts` | კოპირება, ფოტო ან ინიციალები, user id staff ეკრანებზე (მოკლე id + tooltip + filter link). |
| `pipes/money.pipe.ts`, `utc-date.pipe.ts`, `account-number.pipe.ts` | თანხა ვალუტით, UTC თარიღი ლოკალურ დროში, masked ნომერი. |
| `forms/validators.ts`, `field-error.ts`, `server-errors.ts`, `password-rules.component.ts`, `registration-form.ts`, `registration-fields.component.ts` | backend-ის წესების ასლი, შეცდომის ტექსტები, server errors → fields, რეგისტრაციის საერთო ფორმა (customer + admin "Create staff"). |
| `filters/filter-bar.component.ts`, `_filter-bar.scss`, `url-filters.ts`, `url-paged-list.ts` | **ერთი** filter bar მთელ აპში; filter-ები URL-ში; server-paged სია. |
| `cards/card-utils.ts`, `card-picker.component.ts`, `card-visual.component.ts` | ბარათების წესები, decline reason-ების **ერთი** mapping, ბარათის არჩევა Demo Shop-ისთვის. |

### რატომ ასე
- **ერთნაირი UX:** ყველა გვერდს აქვს loading, error და empty state, ერთი confirm dialog და ერთი filter bar.
- **ერთი წყარო:** მაგ. decline reason-ების ტექსტი მხოლოდ `card-utils.ts`-შია, filter-ების სტილი მხოლოდ `_filter-bar.scss`-ში. ცვლილება ერთ ადგილზე ხდება.
- **Privacy:** `UserRefComponent` ცხრილში სრულ GUID-ს არასოდეს წერს; სახელს აჩვენებს მხოლოდ მაშინ, თუ backend-მა გამოგზავნა.

### შესაძლო კითხვები
1. **რატომ არის filter-ები URL-ში?** გვერდი reload-ზე იგივე რჩება, ბმულის გაზიარება შეიძლება, back/forward მუშაობს.
2. **როგორ უზრუნველყოფთ, რომ client-ის validation backend-ს ემთხვევა?** `validators.ts` backend-ის კოდიდან გადატანილი წესებია (password policy, ტელეფონი `+995`, პირადი ნომერი 11 ციფრი, თანხის ფორმატი). Server-ის შეცდომა მაინც ჩანს ველთან `applyServerErrors()`-ით.
3. **`@defer` სად გამოიყენეთ და რატომ?** Manager dashboard-ის diagram-ებზე: Chart.js იტვირთება მხოლოდ მაშინ, როცა diagram ეკრანზე ჩანს, ამიტომ dashboard-ის tile-ები უფრო სწრაფად ჩანს.

---

## 7. რა არის ტესტირებული და როგორ

**როგორ ვუშვებ:** `npx ng test --watch=false --browsers=ChromeHeadless` (Karma + Jasmine, ChromeHeadless). ამჟამად **147 test**, ყველა გადის. Production build: `npx ng build`.

### ტესტების სახეები
1. **Pure logic (DOM-ის გარეშე):** ფორმების წესები და გამოთვლები.
   - `features/transfers/new-transfer/transfer-form.spec.ts`
   - `features/conversions/new-conversion/conversion-form.spec.ts`
   - `features/recipients/recipient-utils.spec.ts`
   - `shared/cards/card-utils.spec.ts` (limits, ყველა decline reason)
   - `core/util/csv.spec.ts` (CSV escaping, formula guard)
   - `features/analytics/analytics.spec.ts` (თარიღების დიაპაზონი, exclusive toDate, chart mapping)
   - `features/demo-shop/demo-shop.spec.ts` (cart: totals, 1–10 რაოდენობა, sessionStorage)
2. **Component tests (TestBed, mocked API):**
   - `new-transfer-page.component.spec.ts`, `new-conversion-page.component.spec.ts`
   - `features/cards/dialogs/card-dialogs.spec.ts`: ბარათის სრული ნომერი ერთხელ ჩანს და dialog-ის დახურვის შემდეგ აღარსად რჩება;
   - `features/cards/edit-limits.spec.ts`: bug-ის რეპროდუქცია (form-ი `[formGroup]`-ის გარეშე page reload-ს აკეთებდა);
   - `features/manager/manager-pages.spec.ts`, `account-transactions.spec.ts`: URL filter-ები → API, review/resolve, "Loading"-ზე გაჭედვის bug;
   - `features/admin/admin.spec.ts`: ban/unban და freeze ღილაკების წესები role-ის მიხედვით;
   - `shared/filters/filter-bar.spec.ts`: Clear filters, URL sync და layout-ის გაზომვა (ველების სიმაღლე, ტელეფონის სიგანე);
   - `shared/ui/user-ref.spec.ts`.
3. **HTTP-ის ტესტები (`HttpTestingController`):**
   - `core/auth/session-end.spec.ts`: დაბლოკილი მომხმარებელი, 401 → ერთი refresh (400) → ერთი toast → `/login`;
   - `features/accounts/accounts.api.spec.ts`: statement-ის ექსპორტი გვერდებით.
4. **Routing tests (`root-routing.spec.ts`):** ნამდვილი route config, lazy გვერდები stub-ებით:
   - სტუმარი `/`-ზე ხედავს landing-ს, შესული მომხმარებელი გადადის role-ის home-ზე;
   - **F5 regression:** guard-ები ელოდება restore-ს; deep link რჩება Customer, Manager და Admin-ისთვის; უარყოფილი refresh → logout; network/5xx → retry გვერდი. ეს test-ები ძველ კოდზე ვარდებოდა (შემოწმებულია).
5. **Guard tests:** `features/manager/manager.spec.ts` და `admin.spec.ts`: Customer, Manager და Admin route-ებზე.

### პრინციპი
ყოველი ნაპოვნი bug-ისთვის ჯერ ვწერდი test-ს, რომელიც bug-ს იმეორებს, მერე ვასწორებდი (edit limits, transactions "Loading", F5 logout). ფულისა და უსაფრთხოების ლოგიკა (idempotency key, card number reveal, session end) ცალკეა დატესტილი.

### შესაძლო კითხვები
1. **რა არ არის ტესტირებული?** E2E ტესტი ნამდვილ backend-თან ავტომატურად არ გვაქვს. ამისთვის `DEPLOY.md`-ში არის smoke-test checklist (register, transfer, conversion, Demo Shop, manager, admin, F5, password reset).
2. **როგორ ამოწმებთ, რომ test-ი ნამდვილად იჭერს bug-ს?** კრიტიკულ შემთხვევებში (edit limits, F5) test-ი ჯერ ძველ კოდზე გავუშვი და ჩავარდა, მერე fix-ის შემდეგ გაიარა.
3. **რატომ Karma/Jasmine?** Angular 19 CLI-ის სტანდარტული setup-ია; ტესტები რეალურ ბრაუზერში (ChromeHeadless) ეშვება, ამიტომ layout-ის გაზომვაც შეიძლება (filter bar-ის ტესტი).

---

## დამატებით: სად ვნახო დეტალები
- `CLAUDE.md`: ყველა endpoint-ის contract და გადაწყვეტილებები (backend-ის კოდიდან შემოწმებული).
- `DEPLOY.md`: Docker, nginx, droplet, HTTPS, smoke test.
- `nginx/`: production server-ის config (SPA fallback, `/api` proxy, security headers, CSP).
