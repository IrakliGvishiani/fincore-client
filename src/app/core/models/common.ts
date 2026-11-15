/** ISO-8601 date string from the backend. UTC, usually without a trailing `Z`; parse with `parseUtc()`. */
export type IsoDateString = string;

/** The backend's CommonResponse envelope. */
export interface ApiResponse<T> {
  message: string;
  result: T;
  isSuccess: boolean;
  statusCode: number;
}

/** Normalized page; every paged endpoint is mapped to this shape by ApiClient.getPaged(). */
export interface Paged<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}

export interface PageQuery {
  pageNumber: number;
  pageSize: number;
}

/** Query-string values accepted by ApiClient; null/undefined/'' are dropped. */
export type QueryValue = string | number | boolean | Date | null | undefined;
export type QueryParams = Record<string, QueryValue>;

/** Receipt endpoints return an ASP.NET FileContentResult serialized as JSON inside `result`. */
export interface FileContentResult {
  fileContents: string; // base64
  contentType: string;
  fileDownloadName: string;
}
