export type Role = "ADMIN" | "FACULTY";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
};
