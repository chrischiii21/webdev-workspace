export type Role = "admin" | "developer";
export type EmploymentType = "intern" | "employee";

export function roleOf(appMetadata: Record<string, unknown> | undefined): Role {
  return appMetadata?.role === "admin" ? "admin" : "developer";
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
