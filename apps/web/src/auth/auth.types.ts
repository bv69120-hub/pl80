export interface AuthenticatedUser {
  id: string;
  username: string;
  role: "ADMIN" | "EMPLOYE";
}

export interface LoginResponse {
  token: string;
  user: AuthenticatedUser;
}
