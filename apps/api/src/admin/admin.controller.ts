import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@relationship/auth";

import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminService } from "./admin.service";
import {
  AcceptWorkspaceInvitationDto,
  CreateConnectorAccountDto,
  InviteWorkspaceMemberDto,
  SyncConnectorDto,
  UpdateConnectorAccountDto,
  UpdateWorkspaceMemberDto,
  UpdateWorkspacePolicyDto,
} from "./dto";

@UseGuards(JwtAuthGuard)
@Controller("workspaces/:workspaceId/admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("members")
  listMembers(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.adminService.listMembers(principal, workspaceId);
  }

  @Post("members")
  inviteMember(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Body() input: InviteWorkspaceMemberDto,
  ) {
    return this.adminService.inviteMember(principal, workspaceId, input);
  }

  @Patch("members/:membershipId")
  updateMember(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("membershipId") membershipId: string,
    @Body() input: UpdateWorkspaceMemberDto,
  ) {
    return this.adminService.updateMember(principal, workspaceId, membershipId, input);
  }

  @Delete("members/:membershipId")
  removeMember(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("membershipId") membershipId: string,
  ) {
    return this.adminService.removeMember(principal, workspaceId, membershipId);
  }

  @Delete("invitations/:invitationId")
  revokeInvitation(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("invitationId") invitationId: string,
  ) {
    return this.adminService.revokeInvitation(principal, workspaceId, invitationId);
  }

  @Get("policy")
  getPolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.adminService.getPolicy(principal, workspaceId);
  }

  @Put("policy")
  updatePolicy(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Body() input: UpdateWorkspacePolicyDto,
  ) {
    return this.adminService.updatePolicy(principal, workspaceId, input);
  }

  @Get("connectors")
  listConnectors(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.adminService.listConnectors(principal, workspaceId);
  }

  @Post("connectors")
  createConnector(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Body() input: CreateConnectorAccountDto,
  ) {
    return this.adminService.createConnector(principal, workspaceId, input);
  }

  @Patch("connectors/:connectorId")
  updateConnector(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("connectorId") connectorId: string,
    @Body() input: UpdateConnectorAccountDto,
  ) {
    return this.adminService.updateConnector(principal, workspaceId, connectorId, input);
  }

  @Post("connectors/:connectorId/sync")
  syncConnector(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("connectorId") connectorId: string,
    @Body() input: SyncConnectorDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.adminService.syncConnector(
      principal,
      workspaceId,
      connectorId,
      input,
      idempotencyKey,
    );
  }

  @Delete("connectors/:connectorId")
  revokeConnector(
    @CurrentUser() principal: AuthenticatedPrincipal,
    @Param("workspaceId") workspaceId: string,
    @Param("connectorId") connectorId: string,
  ) {
    return this.adminService.revokeConnector(principal, workspaceId, connectorId);
  }
}

@Controller("invitations")
export class WorkspaceInvitationsController {
  constructor(private readonly adminService: AdminService) {}

  @Get(":token")
  get(@Param("token") token: string) {
    return this.adminService.getInvitation(token);
  }

  @Post(":token/accept")
  accept(@Param("token") token: string, @Body() input: AcceptWorkspaceInvitationDto) {
    return this.adminService.acceptInvitation(token, input);
  }
}
