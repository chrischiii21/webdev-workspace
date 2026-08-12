import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { employmentTypeOf, nameOf, passwordOf, roleOf } from "@/lib/roles";
import AddUserForm from "./AddUserForm";
import PasswordCell from "./PasswordCell";
import DeleteUserButton from "./DeleteUserButton";
import LastSignIn from "./LastSignIn";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();

  // Middleware already gates this route -- this is defense in depth.
  if (!me || roleOf(me.app_metadata) !== "admin") redirect("/");

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.listUsers();

  return (
    <main className="flex w-full flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Users</h1>
        <p className="text-sm text-foreground/60">Create teammate accounts and manage roles</p>
      </div>

      <AddUserForm />

      {error && <p className="bg-brand-red/10 px-3 py-2 text-xs text-brand-red">{error.message}</p>}

      <div className="overflow-hidden clay">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--surface-border)] text-xs uppercase tracking-wide text-foreground/40">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Password</th>
              <th className="px-4 py-3 font-medium">Last sign in</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--surface-border)] last:border-0">
                <td className="px-4 py-3 text-foreground/80">{nameOf(u.app_metadata) ?? "—"}</td>
                <td className="px-4 py-3">
                  {u.email}
                  {u.id === me.id && <span className="ml-2 text-xs text-foreground/40">(you)</span>}
                </td>
                <td className="px-4 py-3 capitalize text-foreground/70">{roleOf(u.app_metadata)}</td>
                <td className="px-4 py-3 capitalize text-foreground/70">{employmentTypeOf(u.app_metadata)}</td>
                <td className="px-4 py-3">
                  <PasswordCell password={passwordOf(u.app_metadata)} />
                </td>
                <td className="px-4 py-3 text-foreground/50">
                  <LastSignIn iso={u.last_sign_in_at ?? null} />
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== me.id && <DeleteUserButton id={u.id} email={u.email ?? ""} />}
                </td>
              </tr>
            ))}
            {data?.users.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-foreground/40">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
