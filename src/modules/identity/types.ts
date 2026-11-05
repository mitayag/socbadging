export type Role = "ADMIN" | "FACULTY" | "STUDENT";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword?: boolean;
};
