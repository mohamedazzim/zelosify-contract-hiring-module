/**
 * Common interfaces and types used across the application
 * These interfaces provide reusable type definitions matching actual controller implementations
 */

import { AuthProvider } from "@prisma/client";
import { Request } from "express";

/**
 * Standard API response structure used across all controllers
 * Simple success/error pattern with optional data
 */
export interface ApiResponse<T = any> {
  /** Success or error message */
  message?: string;
  /** Error message for failed requests */
  error?: string;
  /** Response data payload */
  data?: T;
  /** Additional response fields as needed */
  [key: string]: any;
}

/**
 * User tenant information for multi-tenant operations
 */
export interface UserTenant {
  /** Unique tenant identifier */
  tenantId: string;
  /** Company name for the tenant */
  companyName: string;
}

/**
 * Authenticated user information structure
 * Used consistently across all controllers
 */
export interface AuthenticatedUser {
  /** Unique user identifier */
  id: string;
  /** Username */
  username: string;
  /** User email address */
  email: string;
  /** User role in the system */
  role: string;
  /** User department */
  department: string;
  /** Authentication provider used */
  provider: AuthProvider;
  /** Tenant information for multi-tenant setup */
  tenant: UserTenant;
}

/**
 * Extended Express Request interface with authenticated user
 * This is the primary request interface used across all controllers
 */
export interface AuthenticatedRequest extends Request {
  /** Authenticated user information (populated by auth middleware) */
  user_id?: string;
  /** Authenticated user object (populated by auth middleware) */
  user?: AuthenticatedUser;
}

/**
 * Digital initiative request body structure
 */
export interface DigitalInitiativeRequest {
  /** Title of the initiative */
  initiativeTitle: string;
  /** Business rationale for the initiative */
  businessRationale: string;
  /** Number of enterprise resources required */
  enterpriseResourceCount: number;
  /** Duration of resources in months/weeks */
  resourceDuration: number;
  /** Success criteria (can be string or structured object) */
  successCriteria: string | object;
  /** Project timeline (can be string or structured object) */
  timeline: string | object;
  /** Additional comments (optional) */
  additionalComments?: string;
}

/**
 * Digital initiative creation response
 */
export interface DigitalInitiativeResponse {
  /** Generated request identifier */
  requestIdentifier: string;
  /** Success message */
  message?: string;
}

/**
 * Form validation error response
 */
export interface FormValidationError {
  /** Error message */
  error: string;
  /** Detailed validation errors */
  details?: any[];
}
