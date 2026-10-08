export interface TenantScope {
  tenantId: string;
}

export interface TenantWorkspaceScope extends TenantScope {
  workspaceId: string;
}

export function tenantWhere(scope: TenantScope): { tenantId: string } {
  return {
    tenantId: scope.tenantId,
  };
}

export function tenantWorkspaceWhere(scope: TenantWorkspaceScope): {
  tenantId: string;
  workspaceId: string;
} {
  return {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  };
}
