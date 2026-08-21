export type Role = "admin" | "manager" | "developer";
export type EmploymentType = "intern" | "employee";

export function roleOf(appMetadata: Record<string, unknown> | undefined): Role {
  if (appMetadata?.role === "admin") return "admin";
  if (appMetadata?.role === "manager") return "manager";
  return "developer";
}

// Managers get admin-level page access (Users, etc.) but not admin-only
// actions -- creating/deleting accounts or viewing generated passwords.
export function canViewAllPages(role: Role): boolean {
  return role === "admin" || role === "manager";
}

export function canManageUsers(role: Role): boolean {
  return role === "admin";
}

export function canViewPasswords(role: Role): boolean {
  return role === "admin";
}

export function employmentTypeOf(appMetadata: Record<string, unknown> | undefined): EmploymentType {
  return appMetadata?.employment_type === "intern" ? "intern" : "employee";
}

export function passwordOf(appMetadata: Record<string, unknown> | undefined): string | null {
  return typeof appMetadata?.generated_password === "string" ? appMetadata.generated_password : null;
}

export function nameOf(appMetadata: Record<string, unknown> | undefined): string | null {
  return typeof appMetadata?.name === "string" && appMetadata.name.trim() ? appMetadata.name : null;
}

export function canAccessTask(
  assignedTo: string[],
  appMetadata: Record<string, unknown> | undefined,
  email: string | null | undefined,
): boolean {
  return roleOf(appMetadata) === "admin" || (email != null && assignedTo.includes(email));
}

// Non-admins may only delete tasks they created themselves -- in particular,
// they can never delete a task an admin created.
export function canDeleteTask(
  createdBy: string,
  appMetadata: Record<string, unknown> | undefined,
  email: string | null | undefined,
): boolean {
  return roleOf(appMetadata) === "admin" || createdBy === email;
}
