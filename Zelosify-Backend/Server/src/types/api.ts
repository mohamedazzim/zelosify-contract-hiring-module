/**
 * API-specific interfaces for request and response handling
 * These interfaces define the structure for HTTP request/response data used in controllers
 */

/**
 * Standard error response structure
 * Used consistently across all controllers
 */
export interface ErrorResponse {
  /** Error message */
  error: string;
  /** Additional error details */
  details?: string;
  /** HTTP status code */
  statusCode?: number;
}

/**
 * Success response structure
 * Used for successful operations
 */
export interface SuccessResponse<T = any> {
  /** Success message */
  message: string;
  /** Response data */
  data?: T;
  /** HTTP status code */
  statusCode?: number;
}
