export interface LoginRequest {
  /** The backend logs in by user name, which is the email. */
  userName: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface UserRegistrationRequest {
  firstName: string;
  lastName: string;
  email: string;
  /** Exactly 11 digits. */
  personalNumber: string;
  /** +995XXXXXXXXX */
  phoneNumber: string;
  password: string;
}

export interface ConfirmEmailRequest {
  email: string;
  code: string;
}

export interface ResetPasswordRequest {
  email: string;
  token: string;
  newPassword: string;
}
