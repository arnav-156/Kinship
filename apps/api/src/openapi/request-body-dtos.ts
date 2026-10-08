import type { Type } from "@nestjs/common";

import {
  AcceptWorkspaceInvitationDto,
  CreateConnectorAccountDto,
  InviteWorkspaceMemberDto,
  SyncConnectorDto,
  UpdateConnectorAccountDto,
  UpdateWorkspaceMemberDto,
  UpdateWorkspacePolicyDto,
} from "../admin/dto";
import { SubmitAiFeedbackDto } from "../ai-feedback/dto";
import { LoginDto, RegisterDto } from "../auth/dto";
import {
  CreateSuppressionEntryDto,
  EvaluateComplianceDto,
  UpsertContactChannelDto,
} from "../compliance/dto";
import {
  RestoreDraftVersionDto,
  RewriteDraftMessageDto,
  UpdateDraftMessageDto,
  ValidateDraftMessageDto,
} from "../drafts/dto";
import { AnalyzeUrlDto, IngestEvidenceDto, RecordRelationshipOutcomeDto } from "../evidence/dto";
import { DeleteAccountDto } from "../privacy/dto";
import {
  CreateProspectListDto,
  CreateProspectListMemberDto,
  ImportProspectListDto,
  UpdateProspectListDto,
  UpdateProspectListMemberDto,
} from "../prospect-lists/dto";
import { CreateDraftMessageDto, CreateRelationshipBriefDto } from "../relationship-briefs/dto";
import { CreateRelationshipNoteDto, UpdateRelationshipNoteDto } from "../relationship-notes/dto";
import { UpdateRetentionPolicyDto } from "../retention/dto";
import { SearchEvidenceDto, SearchSimilarPeopleDto } from "../search/dto";
import { CreateWorkspaceDto, UpdateWorkspaceDto } from "../workspaces/dto";

export const requestBodyDtos: Readonly<Record<string, Type<unknown>>> = {
  "Admin.createConnector": CreateConnectorAccountDto,
  "Admin.inviteMember": InviteWorkspaceMemberDto,
  "Admin.syncConnector": SyncConnectorDto,
  "Admin.updateConnector": UpdateConnectorAccountDto,
  "Admin.updateMember": UpdateWorkspaceMemberDto,
  "Admin.updatePolicy": UpdateWorkspacePolicyDto,
  "AiFeedback.submit": SubmitAiFeedbackDto,
  "Auth.login": LoginDto,
  "Auth.register": RegisterDto,
  "Compliance.createSuppression": CreateSuppressionEntryDto,
  "Compliance.evaluate": EvaluateComplianceDto,
  "Compliance.upsertContactChannel": UpsertContactChannelDto,
  "Drafts.restoreVersion": RestoreDraftVersionDto,
  "Drafts.rewrite": RewriteDraftMessageDto,
  "Drafts.update": UpdateDraftMessageDto,
  "Drafts.validate": ValidateDraftMessageDto,
  "Evidence.analyzeUrl": AnalyzeUrlDto,
  "Evidence.ingest": IngestEvidenceDto,
  "Evidence.queueIngestion": IngestEvidenceDto,
  "Evidence.recordRelationshipOutcome": RecordRelationshipOutcomeDto,
  "Privacy.requestDeletion": DeleteAccountDto,
  "ProspectLists.addMember": CreateProspectListMemberDto,
  "ProspectLists.create": CreateProspectListDto,
  "ProspectLists.importCsv": ImportProspectListDto,
  "ProspectLists.update": UpdateProspectListDto,
  "ProspectLists.updateMember": UpdateProspectListMemberDto,
  "RelationshipBriefs.create": CreateRelationshipBriefDto,
  "RelationshipBriefs.createDraft": CreateDraftMessageDto,
  "RelationshipNotes.create": CreateRelationshipNoteDto,
  "RelationshipNotes.update": UpdateRelationshipNoteDto,
  "Retention.updatePolicy": UpdateRetentionPolicyDto,
  "Search.searchEvidence": SearchEvidenceDto,
  "Search.searchProspects": SearchEvidenceDto,
  "Search.searchSimilarPeople": SearchSimilarPeopleDto,
  "WorkspaceInvitations.accept": AcceptWorkspaceInvitationDto,
  "Workspaces.create": CreateWorkspaceDto,
  "Workspaces.update": UpdateWorkspaceDto,
};
