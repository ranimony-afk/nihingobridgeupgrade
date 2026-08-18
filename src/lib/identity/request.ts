import { getUserById } from "./service";
import { readAccessToken } from "./cookies";
import { verifyJwt } from "./jwt";
import { hasPermission, type Permission } from "./rbac";

export async function getIdentity(request?: Request) {
  const token = await readAccessToken(request);
  const claims = verifyJwt(token);
  if (!claims || claims.typ !== "access") return null;
  const user = await getUserById(claims.sub);
  if (!user || user.status !== "active") return null;
  return {
    ...user,
    permissionsOk: (permission: Permission) => hasPermission(user.role, permission),
  };
}
