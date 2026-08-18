/**
 * Authentication and authorization interfaces
 * These interfaces define the actual auth patterns used in the controllers
 */

/**
 * User registration request body structure
 * Used in authController register function
 */
export interface RegisterRequest {
  /** Username for the new user */
  username: string;
  /** User email address */
  email: string;
  /** User password */
  password: string;
  /** User's first name */
  firstName: string;
  /** User's last name */
  lastName: string;
  /** User's phone number */
  phoneNumber: string;
  /** Tenant ID for multi-tenant setup */
  tenantId: string;
  /** User's department */
  department: string;
  /** User's role in the system */
  role: string;
}

/**
 * User login credentials
 */
export interface LoginCredentials {
  /** User email or username */
  email: string;
  /** User password */
  password: string;
}

/**
 * JWT token response structure
 */
export interface TokenResponse {
  /** Access token for API requests */
  access_token: string;
  /** Refresh token for token renewal */
  refresh_token: string;
}

/**
 * User registration response
 */
export interface RegisterResponse {
  /** Success message */
  message: string;
  /** Created user data */
  user: {
    id: string;
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    phoneNumber: string;
    department: string;
    role: string;
    tenantId: string;
    provider: string;
  };
  /** QR code for TOTP setup */
  qrCode: string;
  /** OTP Auth URL */
  otpAuthUrl: string;
  /** Token expiration time */
  expiresIn: number;
}

/**
 * Login verification response for TOTP required
 */
export interface LoginTOTPRequiredResponse {
  /** Message indicating TOTP is required */
  message: string;
}

/**
 * Login success response for seeded users (bypasses TOTP)
 */
export interface LoginSuccessResponse {
  /** Success flag */
  success: boolean;
  /** Success message */
  message: string;
  /** User data */
  user: {
    id: string;
    username: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    role: string;
    department: string | null;
    provider: string;
    tenantId: string | null;
  };
  /** Redirect URL after login */
  redirectTo: string;
}
