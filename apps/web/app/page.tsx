"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  Activity,
  ArrowRight,
  Bell,
  BookOpenText,
  Check,
  Clock3,
  ChevronDown,
  Copy,
  DatabaseZap,
  Download,
  FileCheck2,
  Home,
  Inbox,
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  Upload,
  UserRoundSearch,
  UserX,
  X,
} from "lucide-react";
import {
  buildOnboardingSteps,
  buildWorkflowProgress,
  classifyCompletedJob,
  createNoteTimelineItem,
  filterAndSortProspects,
  formatAuditEventLabel,
  getBusyActionLabel,
  getToastTone,
  summarizeComplianceDecision,
  summarizeDraftSaveState,
  summarizeJobStatus,
  summarizeSuppressionEntry,
  summarizeWorkspaceHealth,
  type BusyAction,
  type NoteTimelineItem,
  type ProspectSort,
  type ToastTone,
} from "./dashboard-model.js";

type Workspace = {
  id: string;
  name: string;
  role?: string;
};

type EvidenceItem = {
  confidenceScore: number;
  evidenceId: string;
  entityId: string;
  freshnessScore: number;
  rankScore: number;
  reasons: string[];
  sourceType?: string;
  summary: string;
};

type Prospect = {
  entity: {
    canonicalName: string;
    id: string;
    type: string;
  };
  evidence: EvidenceItem[];
  fitScore: number;
  prospectType: string;
};

type ProspectListSummary = {
  _count: {
    members: number;
  };
  description?: null | string;
  id: string;
  name: string;
  updatedAt: string;
};

type RelationshipActivityType = "brief" | "draft" | "evidence" | "note" | "outcome" | "policy";
type RelationshipActivity = {
  actor?: null | { displayName?: null | string; email: string; id: string };
  at: string;
  id: string;
  metadata?: Record<string, unknown>;
  sourceId: string;
  status?: string;
  summary: string;
  title: string;
  type: RelationshipActivityType;
};
type RelationshipTimelineResponse = {
  items: RelationshipActivity[];
  nextCursor: null | string;
};
type RelationshipOutcomeKind =
  | "follow_up_scheduled"
  | "introduction_made"
  | "meeting_held"
  | "not_interested"
  | "opportunity_created"
  | "other"
  | "reply_received";

type ProspectListMember = {
  confidenceScore?: null | number;
  entity: {
    canonicalName: string;
    id: string;
    organization?: null | { name: string };
    person?: null | { fullName: string };
    type: string;
  };
  fitScore?: null | number;
  id: string;
  notes?: null | string;
  relationshipStage: string;
};

const relationshipActivityFilters: Array<{
  id: "all" | RelationshipActivityType;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "evidence", label: "Evidence" },
  { id: "note", label: "Notes" },
  { id: "brief", label: "Briefs" },
  { id: "draft", label: "Drafts" },
  { id: "policy", label: "Policy" },
  { id: "outcome", label: "Outcomes" },
];

type ProspectListDetail = Omit<ProspectListSummary, "_count"> & {
  members: ProspectListMember[];
};

type ProspectImportResult = {
  addedMembers: number;
  createdEntities: number;
  rowCount: number;
  updatedMembers: number;
};

type Brief = {
  channelRisk: "allowed" | "warn" | "blocked";
  confidenceScore: number | null;
  evidenceCards: EvidenceCard[];
  fitScore: number | null;
  goal: string;
  id: string;
  outreachAngles: Array<{
    evidenceIds: string[];
    label: string;
    rationale: string;
  }>;
  recommendedChannel: string;
  summary: string;
  warnings: string[];
};

type EvidenceCard = {
  confidenceScore: number;
  evidenceId: string;
  rankScore: number;
  sourceType?: string;
  summary: string;
};

type Draft = {
  body: string;
  channelType: string;
  createdAt: string;
  evidenceClaims: Array<{
    evidenceIds: string[];
    text: string;
  }>;
  id: string;
  status: "draft" | "needs_review" | "validated" | "blocked" | "archived";
  tone: string;
  validationResult: {
    blockedReasons?: string[];
    compliance?: {
      decision: string;
      reason: string;
      reviewRequired: boolean;
      warnings: string[];
    };
    unsupportedClaims?: string[];
    warnings?: string[];
  };
  updatedAt: string;
  variant: "concise" | "warm_professional" | "evidence_heavy";
};

type DraftVersion = {
  body: string;
  createdAt: string;
  createdBy?: { displayName?: null | string; email: string; id: string } | null;
  id: string;
  reason: string;
  status: Draft["status"];
  tone: string;
  variant: Draft["variant"];
  version: number;
};

type AuditEvent = {
  createdAt: string;
  eventType: string;
  id: string;
  subjectType?: string;
};
type ComplianceDecisionState = {
  decision: string;
  reason: string;
  warnings: string[];
};
type PolicyPurpose = "relationship_intelligence" | "outreach_review";
type RecipientType = "personal" | "professional" | "unknown";
type ContactChannelPolicyContext = {
  channelType: (typeof outreachChannels)[number];
  consentStatus: "confirmed" | "unknown" | "withdrawn";
  purpose: PolicyPurpose;
  recipientRegion: string;
  recipientType: RecipientType;
};

type SuppressionEntry = {
  channelType: string;
  createdAt?: string;
  id: string;
  reason?: string;
  source?: null | string;
  workspaceId?: null | string;
};

type JobStatus = {
  attempts?: number;
  createdAt?: string;
  failureReason?: null | string;
  id: string;
  jobName: string;
  maxAttempts?: number;
  progress?: {
    briefId?: string;
    connectorRunId?: string;
    draftId?: string;
    entityId?: string;
    evidenceItemCount?: number;
    evidenceItemIds?: string[];
    percent?: number;
    deleted?: { evidenceItems: number; sourceSnapshots: number; total: number };
    sourceSnapshotId?: string;
    stage?: string;
  };
  queueName?: string;
  status: string;
  updatedAt?: string;
};

type RetentionPolicy = {
  dataClass: "evidence";
  enabled: boolean;
  id: string;
  retentionDays: number;
  updatedAt: string;
};
type RetentionPreview = {
  dataClass: "evidence";
  dueEvidenceItems: number;
  dueSourceSnapshots: number;
  nextExpirationAt: null | string;
  totalDue: number;
};
type RetentionSummary = {
  lastRun: JobStatus | null;
  policies: RetentionPolicy[];
  preview: RetentionPreview;
};

type UserDataRequest = {
  completedAt: null | string;
  createdAt: string;
  downloadAvailable: boolean;
  expiresAt: null | string;
  failureReason: null | string;
  id: string;
  requestType: "deletion" | "export";
  status: "completed" | "failed" | "processing";
  updatedAt: string;
};

type WorkspaceRoleName =
  "owner" | "admin" | "manager" | "member" | "viewer" | "compliance_reviewer";
type AdminWorkspaceMember = {
  createdAt: string;
  id: string;
  role: WorkspaceRoleName;
  user: {
    displayName?: null | string;
    email: string;
    id: string;
    lastLoginAt?: null | string;
    status: string;
  };
};
type AdminWorkspaceInvitation = {
  createdAt: string;
  email: string;
  expiresAt: string;
  id: string;
  role: WorkspaceRoleName;
};
type AdminMembersResponse = {
  invitations: AdminWorkspaceInvitation[];
  members: AdminWorkspaceMember[];
};
type WorkspacePolicySettings = {
  defaultConsentStatus: "confirmed" | "unknown" | "withdrawn";
  defaultPurpose: PolicyPurpose;
  defaultRecipientRegion: string;
  defaultRecipientType: RecipientType;
  id: null | string;
  workspaceId: string;
};
type AdminConnector = {
  displayName?: null | string;
  id: string;
  provider: string;
  runs: Array<{
    createdAt: string;
    failureReason?: null | string;
    id: string;
    status: string;
  }>;
  status: "active" | "paused" | "revoked";
  updatedAt: string;
};
type InvitationDetails = {
  email: string;
  expiresAt: string;
  role: WorkspaceRoleName;
  workspace: { id: string; name: string };
};
type AuthResponse = {
  accessToken: string;
  user: { email: string; id: string };
  workspace: Workspace;
  workspaces: Workspace[];
};
type AdminTab = "connectors" | "members" | "policy" | "suppressions";

type RelationshipNoteApi = {
  author: {
    displayName?: null | string;
    email: string;
    id: string;
  };
  body: string;
  createdAt: string;
  id: string;
  updatedAt: string;
};

type AuthState = {
  token: string;
  userEmail: string;
  userId: string;
};

type AiConfiguration = {
  configured: boolean;
  model: string;
  provider: "mock" | "openai-compatible";
};

type AiFeedbackTargetType = "brief" | "draft";
type AiFeedbackRating = "helpful" | "not_helpful";
type AiFeedbackRecord = {
  comment: null | string;
  id: string;
  rating: AiFeedbackRating;
  reason: string;
  updatedAt: string;
};
type AiFeedbackResponse = {
  current: AiFeedbackRecord | null;
  outputHash: string;
  stale: boolean;
};
type AiFeedbackFormState = {
  comment: string;
  error: null | string;
  loading: boolean;
  rating: AiFeedbackRating | null;
  reason: string;
  saved: boolean;
  saving: boolean;
  stale: boolean;
};

type PersistedSession = {
  apiBaseUrl: string;
  auth: AuthState;
};

const defaultApiBaseUrl = "http://127.0.0.1:7000/v1";
const sessionStorageKey = "kinship.workspace-session.v1";

const demoWorkspace: Workspace = {
  id: "workspace_demo",
  name: "Relationship Lab",
  role: "owner",
};

const initialEvidence: EvidenceItem[] = [
  {
    confidenceScore: 0.9,
    entityId: "entity_ada",
    evidenceId: "evidence_repo",
    freshnessScore: 0.84,
    rankScore: 0.82,
    reasons: ["keyword match", "high confidence evidence"],
    sourceType: "github",
    summary:
      "Ada maintains a public repository focused on analytical engines and developer tooling.",
  },
  {
    confidenceScore: 0.78,
    entityId: "entity_ada",
    evidenceId: "evidence_paper",
    freshnessScore: 0.7,
    rankScore: 0.69,
    reasons: ["metadata match", "fresh evidence"],
    sourceType: "semantic_scholar",
    summary: "Recent paper metadata links Ada to research collaboration on trustworthy automation.",
  },
];

const initialProspects: Prospect[] = [
  {
    entity: {
      canonicalName: "Ada Lovelace",
      id: "entity_ada",
      type: "person",
    },
    evidence: initialEvidence,
    fitScore: 0.88,
    prospectType: "person",
  },
];

const sourceTypes = [
  "user_url",
  "company_website",
  "github",
  "orcid",
  "semantic_scholar",
  "crossref",
  "manual_linkedin_context",
] as const;

const sourceFilterOptions = ["all", ...sourceTypes] as const;

const draftVariants = ["concise", "warm_professional", "evidence_heavy"] as const;
const outreachChannels = ["email", "linkedin_context"] as const;

const aiFeedbackReasonOptions: Record<AiFeedbackRating, Array<{ label: string; value: string }>> = {
  helpful: [
    { label: "Relevant", value: "relevant" },
    { label: "Accurate", value: "accurate" },
    { label: "Actionable", value: "actionable" },
    { label: "Well grounded", value: "well_grounded" },
    { label: "Other", value: "other" },
  ],
  not_helpful: [
    { label: "Inaccurate", value: "inaccurate" },
    { label: "Irrelevant", value: "irrelevant" },
    { label: "Missing context", value: "missing_context" },
    { label: "Unsupported", value: "unsupported" },
    { label: "Wrong tone", value: "tone" },
    { label: "Other", value: "other" },
  ],
};

const workspaceRoleOptions: Array<{ label: string; value: WorkspaceRoleName }> = [
  { label: "Owner", value: "owner" },
  { label: "Administrator", value: "admin" },
  { label: "Manager", value: "manager" },
  { label: "Member", value: "member" },
  { label: "Viewer", value: "viewer" },
  { label: "Compliance reviewer", value: "compliance_reviewer" },
];
const adminConnectorProviders = [
  "company_website",
  "crossref",
  "github",
  "manual_linkedin_context",
  "orcid",
  "semantic_scholar",
  "user_url",
] as const;
const adminTabs: Array<{ id: AdminTab; label: string }> = [
  { id: "members", label: "Members" },
  { id: "policy", label: "Policy" },
  { id: "suppressions", label: "Suppressions" },
  { id: "connectors", label: "Connectors" },
];

export default function HomePage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [aiConfiguration, setAiConfiguration] = useState<AiConfiguration | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(demoWorkspace);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([demoWorkspace]);
  const [email, setEmail] = useState("owner@example.local");
  const [password, setPassword] = useState("relationship-demo-password");
  const [workspaceName, setWorkspaceName] = useState("Relationship Lab");
  const [subjectName, setSubjectName] = useState("Ada Lovelace");
  const [sourceIdentifier, setSourceIdentifier] = useState(
    "https://github.com/example/analytical-engine",
  );
  const [sourceType, setSourceType] = useState<(typeof sourceTypes)[number]>("github");
  const [goal, setGoal] = useState("research collaboration");
  const [query, setQuery] = useState("research collaboration github");
  const [prospectSearch, setProspectSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<(typeof sourceFilterOptions)[number]>("all");
  const [prospectSort, setProspectSort] = useState<ProspectSort>("fit");
  const [savedProspectIds, setSavedProspectIds] = useState<Set<string>>(
    () => new Set(["entity_ada"]),
  );
  const [prospectLists, setProspectLists] = useState<ProspectListSummary[]>([]);
  const [activeProspectListId, setActiveProspectListId] = useState("");
  const [activeProspectList, setActiveProspectList] = useState<ProspectListDetail | null>(null);
  const [showProspectLists, setShowProspectLists] = useState(false);
  const [prospectListName, setProspectListName] = useState("Priority relationships");
  const [prospectListDescription, setProspectListDescription] = useState("");
  const [prospectCsvText, setProspectCsvText] = useState("");
  const [prospectCsvName, setProspectCsvName] = useState("");
  const [retrievalLimit, setRetrievalLimit] = useState(5);
  const [retentionDays, setRetentionDays] = useState(365);
  const [retentionEnabled, setRetentionEnabled] = useState(true);
  const [retentionSummary, setRetentionSummary] = useState<RetentionSummary | null>(null);
  const [confirmRetentionCleanup, setConfirmRetentionCleanup] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("members");
  const [adminMembers, setAdminMembers] = useState<AdminMembersResponse>({
    invitations: [],
    members: [],
  });
  const [adminPolicy, setAdminPolicy] = useState<WorkspacePolicySettings>(() =>
    createDefaultWorkspacePolicy(demoWorkspace.id),
  );
  const [adminConnectors, setAdminConnectors] = useState<AdminConnector[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState<null | string>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<WorkspaceRoleName>("member");
  const [latestInviteLink, setLatestInviteLink] = useState("");
  const [connectorProvider, setConnectorProvider] =
    useState<(typeof adminConnectorProviders)[number]>("github");
  const [connectorDisplayName, setConnectorDisplayName] = useState("");
  const [adminSuppressionChannel, setAdminSuppressionChannel] =
    useState<(typeof outreachChannels)[number]>("email");
  const [adminSuppressionValue, setAdminSuppressionValue] = useState("");
  const [adminSuppressionReason, setAdminSuppressionReason] = useState("Manual opt-out");
  const [dataRequests, setDataRequests] = useState<UserDataRequest[]>([]);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletionPassword, setDeletionPassword] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [channel, setChannel] = useState<(typeof outreachChannels)[number]>("email");
  const [selectedEntityId, setSelectedEntityId] = useState("entity_ada");
  const [evidence, setEvidence] = useState<EvidenceItem[]>(initialEvidence);
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects);
  const [brief, setBrief] = useState<Brief | null>(createDemoBrief());
  const [draft, setDraft] = useState<Draft | null>(createDemoDraft());
  const [draftVariant, setDraftVariant] =
    useState<(typeof draftVariants)[number]>("warm_professional");
  const [draftVersions, setDraftVersions] = useState<DraftVersion[]>([]);
  const [showDraftHistory, setShowDraftHistory] = useState(false);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [draftSavedAt, setDraftSavedAt] = useState<null | string>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState(false);
  const draftEditSequenceRef = useRef(0);
  const feedbackRequestSequenceRef = useRef({ brief: 0, draft: 0 });
  const [aiFeedback, setAiFeedback] = useState<Record<AiFeedbackTargetType, AiFeedbackFormState>>({
    brief: createEmptyAiFeedbackState(),
    draft: createEmptyAiFeedbackState(),
  });
  const [noteBody, setNoteBody] = useState("Follow up after Ada reviews the paper deadline.");
  const [notes, setNotes] = useState<NoteTimelineItem[]>(() => [
    createNoteTimelineItem(
      "Ask about collaboration timing after the trustworthy automation paper deadline.",
      "Ada Lovelace",
      "2026-07-05T09:05:00.000Z",
    ),
  ]);
  const [relationshipActivities, setRelationshipActivities] = useState<RelationshipActivity[]>([
    {
      actor: { displayName: "Ada Lovelace", email: "ada@example.com", id: "demo_user" },
      at: "2026-07-05T09:05:00.000Z",
      id: "note:demo_activity",
      sourceId: "demo_activity",
      summary: "Ask about collaboration timing after the trustworthy automation paper deadline.",
      title: "Relationship note added",
      type: "note",
    },
    {
      at: "2026-07-05T09:00:00.000Z",
      id: "policy:demo_activity",
      sourceId: "demo_policy",
      status: "warn",
      summary: "Email consent needs review before outreach.",
      title: "Policy review required",
      type: "policy",
    },
  ]);
  const [timelineCursor, setTimelineCursor] = useState<null | string>(null);
  const [timelineFilter, setTimelineFilter] = useState<"all" | RelationshipActivityType>("all");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [outcomeKind, setOutcomeKind] = useState<RelationshipOutcomeKind>("follow_up_scheduled");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteBody, setEditingNoteBody] = useState("");
  const [channelValue, setChannelValue] = useState("ada@example.com");
  const [consentStatus, setConsentStatus] = useState<"confirmed" | "unknown" | "withdrawn">(
    "unknown",
  );
  const [policyPurpose, setPolicyPurpose] = useState<PolicyPurpose>("outreach_review");
  const [recipientType, setRecipientType] = useState<RecipientType>("unknown");
  const [recipientRegion, setRecipientRegion] = useState("unknown");
  const [complianceResult, setComplianceResult] = useState<string>(
    "Warn: email consent is unknown",
  );
  const [complianceDecision, setComplianceDecision] = useState<ComplianceDecisionState>({
    decision: "warn",
    reason: "Email consent is unknown",
    warnings: ["Review before outreach."],
  });
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([
    {
      createdAt: "2026-07-05T09:00:00.000Z",
      eventType: "demo.loaded",
      id: "audit_demo",
      subjectType: "workspace",
    },
  ]);
  const [suppressionEntries, setSuppressionEntries] = useState<SuppressionEntry[]>([]);
  const [jobStatuses, setJobStatuses] = useState<JobStatus[]>([
    {
      attempts: 1,
      createdAt: "2026-07-05T09:00:00.000Z",
      id: "job_demo",
      jobName: "evidence.ingest",
      status: "completed",
      updatedAt: "2026-07-05T09:00:00.000Z",
    },
  ]);
  const [status, setStatus] = useState(
    "Demo workspace ready. Sign in to use durable workspace data.",
  );
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: number; message: string; tone: ToastTone }>>([
    {
      id: 1,
      message: "Demo workspace ready. Follow the checklist or sign in to Kinship.",
      tone: "info",
    },
  ]);

  const [activeView, setActiveView] = useState<"overview" | "discover" | "trust">("overview");
  const [showSettings, setShowSettings] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [inviteDetails, setInviteDetails] = useState<InvitationDetails | null>(null);
  const [inviteDisplayName, setInviteDisplayName] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<null | string>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const completedJobIdsRef = useRef(new Set<string>());
  const hasRunningJobs = jobStatuses.some(
    (job) => job.status === "queued" || job.status === "active",
  );
  const latestDataExport = dataRequests.find((request) => request.requestType === "export");

  useEffect(() => {
    function handleKeyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const isTyping = ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowCommandMenu((value) => !value);
        return;
      }
      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        setActiveView("overview");
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (event.key === "Escape") {
        setShowCommandMenu(false);
        setShowProspectLists(false);
        setShowSettings(false);
      }
    }
    document.addEventListener("keydown", handleKeyboard);
    return () => document.removeEventListener("keydown", handleKeyboard);
  }, []);
  useEffect(() => {
    let active = true;

    void (async () => {
      const persisted = readPersistedSession();
      const baseUrl = persisted?.apiBaseUrl ?? defaultApiBaseUrl;

      try {
        const response = await fetch(baseUrl + "/ai/configuration");
        if (response.ok && active) {
          setAiConfiguration((await response.json()) as AiConfiguration);
        }
      } catch {
        if (active) setAiConfiguration(null);
      }

      if (!persisted) return;

      try {
        const response = await fetch(baseUrl + "/auth/me", {
          headers: { Authorization: "Bearer " + persisted.auth.token },
        });
        if (!response.ok) throw new Error("Saved session expired");

        const currentUser = (await response.json()) as {
          email: string;
          id: string;
          memberships: Array<{ role: string; workspace: Workspace }>;
        };
        if (!active) return;

        const restoredWorkspaces = currentUser.memberships.map(({ role, workspace }) => ({
          ...workspace,
          role,
        }));
        setApiBaseUrl(baseUrl);
        setAuth({
          token: persisted.auth.token,
          userEmail: currentUser.email,
          userId: currentUser.id,
        });
        setEmail(currentUser.email);
        setWorkspaces(restoredWorkspaces);
        setWorkspace(restoredWorkspaces[0] ?? demoWorkspace);
        updateStatus("Signed in session restored.");
      } catch {
        window.sessionStorage.removeItem(sessionStorageKey);
        if (active) updateStatus("Saved session expired. Sign in again to use workspace data.");
      }
    })();

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!auth || workspace.id === demoWorkspace.id) {
      return;
    }

    void refreshProspectLists();
    void loadDataRequests();
    if (workspace.role === "owner" || workspace.role === "admin") {
      void loadRetentionSummary();
    } else {
      setRetentionSummary(null);
    }
    // The session token and workspace ID are the deliberate reload boundary.
  }, [auth?.token, workspace.id]);

  useEffect(() => {
    if (!showSettings || !auth || !isWorkspaceAdmin(workspace)) return;
    void loadAdminData();
    // Opening settings and changing workspace are the deliberate admin reload boundaries.
  }, [auth?.token, showSettings, workspace.id]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite")?.trim();
    if (!token) return;
    setInviteToken(token);
    void loadInvitationDetails(token);
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!auth || workspace.id === demoWorkspace.id || !hasRunningJobs) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadJobStatuses().catch(() => undefined);
    }, 750);
    return () => window.clearInterval(timer);
  }, [auth?.token, hasRunningJobs, workspace.id]);

  useEffect(() => {
    if (!auth || workspace.id === demoWorkspace.id) {
      return;
    }

    setTimelineFilter("all");
    void Promise.all([
      refreshRelationshipNotes(selectedEntityId),
      refreshRelationshipTimeline(selectedEntityId, { filter: "all" }),
    ]);
  }, [auth?.token, selectedEntityId, workspace.id]);

  useEffect(() => {
    if (!auth || workspace.id === demoWorkspace.id) {
      return;
    }

    void refreshContactChannelContext(selectedEntityId, channel);
  }, [auth?.token, channel, selectedEntityId, workspace.id]);

  useEffect(() => {
    resetAiFeedback("brief");
    if (!auth || !brief || brief.id.startsWith("brief_demo")) return;
    void loadAiFeedback("brief", brief.id);
    // The session and artifact ID are the deliberate feedback reload boundary.
  }, [auth?.token, brief?.id]);

  useEffect(() => {
    resetAiFeedback("draft");
    if (!auth || !draft || draft.id.startsWith("draft_demo")) return;
    void loadAiFeedback("draft", draft.id);
    // updatedAt catches autosaves, rewrites, validation, and restored versions.
  }, [auth?.token, draft?.id, draft?.updatedAt]);

  useEffect(() => {
    if (!auth || !draft || !isDraftDirty || isDraftSaving || draft.id.startsWith("draft_demo")) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveDraft("autosave");
    }, 900);
    return () => window.clearTimeout(timer);
  }, [auth?.token, draft?.body, draft?.id, draft?.updatedAt, isDraftDirty, isDraftSaving]);

  const selectedProspect = useMemo(
    () => prospects.find((prospect) => prospect.entity.id === selectedEntityId) ?? prospects[0],
    [prospects, selectedEntityId],
  );
  const selectedEvidence = useMemo(
    () => evidence.filter((item) => item.entityId === selectedEntityId),
    [evidence, selectedEntityId],
  );
  const filteredProspects = useMemo(
    () =>
      filterAndSortProspects(prospects, {
        query: prospectSearch,
        savedIds: savedProspectIds,
        sort: prospectSort,
        sourceType: sourceFilter,
      }),
    [prospects, prospectSearch, savedProspectIds, prospectSort, sourceFilter],
  );
  const onboardingSteps = useMemo(
    () =>
      buildOnboardingSteps({
        hasBrief: Boolean(brief),
        hasComplianceReview: complianceResult.length > 0,
        hasDraft: Boolean(draft),
        hasEvidence: evidence.length > 0,
        isAuthenticated: Boolean(auth),
      }),
    [auth, brief, complianceResult, draft, evidence.length],
  );
  const currentStep = onboardingSteps.find((step) => step.current);
  const workflowProgress = useMemo(
    () =>
      buildWorkflowProgress({
        hasBrief: Boolean(brief),
        hasComplianceReview: complianceResult.length > 0,
        hasDraft: Boolean(draft),
        hasEvidence: evidence.length > 0,
      }),
    [brief, complianceResult.length, draft, evidence.length],
  );
  const draftSaveState = useMemo(
    () =>
      summarizeDraftSaveState({
        dirty: isDraftDirty,
        error: draftSaveError,
        savedAt: draftSavedAt,
        saving: isDraftSaving,
      }),
    [draftSaveError, draftSavedAt, isDraftDirty, isDraftSaving],
  );
  const workspaceHealth = useMemo(
    () =>
      summarizeWorkspaceHealth({
        auditEventCount: auditEvents.length,
        evidenceCount: evidence.length,
        prospectCount: prospects.length,
        risk: brief?.channelRisk,
      }),
    [auditEvents.length, brief?.channelRisk, evidence.length, prospects.length],
  );
  const complianceSummary = useMemo(
    () => summarizeComplianceDecision(complianceDecision),
    [complianceDecision],
  );

  async function register() {
    await runAction("register", async () => {
      const response = await apiRequest<{
        accessToken: string;
        user: { email: string; id: string };
        workspace: Workspace;
      }>("/auth/register", {
        body: {
          email,
          displayName: email.split("@")[0] ?? "Owner",
          password,
          tenantName: workspaceName,
          workspaceName,
        },
        method: "POST",
      });
      const nextAuth = {
        token: response.accessToken,
        userEmail: response.user.email,
        userId: response.user.id,
      };
      setAuth(nextAuth);
      persistSession({ apiBaseUrl, auth: nextAuth });
      setWorkspace(response.workspace);
      setWorkspaces([response.workspace]);
      await refreshAiConfiguration();
      updateStatus("Workspace registered and signed in.");
    });
  }

  async function login() {
    await runAction("login", async () => {
      const response = await apiRequest<{
        accessToken: string;
        user: { email: string; id: string };
        workspaces: Workspace[];
      }>("/auth/login", {
        body: { email, password },
        method: "POST",
      });
      const nextAuth = {
        token: response.accessToken,
        userEmail: response.user.email,
        userId: response.user.id,
      };
      setAuth(nextAuth);
      persistSession({ apiBaseUrl, auth: nextAuth });
      setWorkspaces(response.workspaces);
      setWorkspace(response.workspaces[0] ?? workspace);
      await refreshAiConfiguration();
      updateStatus("Signed in and workspace context loaded.");
    });
  }

  async function logout() {
    setBusyAction("logout");
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // Local sign-out must still complete if the API is unavailable.
    } finally {
      window.sessionStorage.removeItem(sessionStorageKey);
      setAuth(null);
      setWorkspace(demoWorkspace);
      setWorkspaces([demoWorkspace]);
      setDataRequests([]);
      setShowDeleteAccount(false);
      setDeletionPassword("");
      setDeletionConfirmation("");
      setBusyAction(null);
      updateStatus("Signed out. Demo workspace is active.");
    }
  }

  async function refreshAiConfiguration() {
    try {
      const response = await fetch(apiBaseUrl + "/ai/configuration");
      if (!response.ok) throw new Error("AI configuration unavailable");
      setAiConfiguration((await response.json()) as AiConfiguration);
    } catch {
      setAiConfiguration(null);
    }
  }

  function applyRetentionSummary(summary: RetentionSummary) {
    const policy = summary.policies.find((item) => item.dataClass === "evidence");
    if (policy) {
      setRetentionDays(policy.retentionDays);
      setRetentionEnabled(policy.enabled);
    }
    setRetentionSummary(summary);
  }

  async function loadRetentionSummary() {
    try {
      const response = await apiRequest<RetentionSummary>(`/workspaces/${workspace.id}/retention`);
      applyRetentionSummary(response);
    } catch {
      setRetentionSummary(null);
    }
  }

  async function saveRetentionPolicy() {
    await runAction("retention", async () => {
      const response = await apiRequest<RetentionSummary>(
        `/workspaces/${workspace.id}/retention/policies/evidence`,
        {
          body: { enabled: retentionEnabled, retentionDays },
          method: "PUT",
        },
      );
      applyRetentionSummary(response);
      setConfirmRetentionCleanup(false);
      updateStatus(
        retentionEnabled
          ? `Evidence retention set to ${retentionDays} days.`
          : "Automatic evidence expiration disabled.",
      );
    });
  }

  async function previewRetentionCleanup() {
    await runAction("retention", async () => {
      const preview = await apiRequest<RetentionPreview>(
        `/workspaces/${workspace.id}/retention/preview`,
        { method: "POST" },
      );
      setRetentionSummary((current) => (current ? { ...current, preview } : current));
      updateStatus(
        preview.totalDue > 0
          ? `${preview.totalDue} expired records are ready for cleanup.`
          : "No expired records are currently due.",
      );
    });
  }

  async function executeRetentionCleanup() {
    await runAction("retention", async () => {
      const job = await apiRequest<JobStatus>(`/workspaces/${workspace.id}/retention/execute`, {
        method: "POST",
      });
      setJobStatuses((items) => [job, ...items.filter((item) => item.id !== job.id)].slice(0, 20));
      setConfirmRetentionCleanup(false);
      await loadRetentionSummary();
      const deleted = job.progress?.deleted?.total ?? 0;
      updateStatus(`Retention cleanup completed. ${deleted} expired records deleted.`);
    });
  }

  async function loadAdminData() {
    setAdminLoading(true);
    setAdminError(null);
    try {
      const [members, policy, connectors, suppressions, retention] = await Promise.all([
        apiRequest<AdminMembersResponse>(`/workspaces/${workspace.id}/admin/members`),
        apiRequest<WorkspacePolicySettings>(`/workspaces/${workspace.id}/admin/policy`),
        apiRequest<AdminConnector[]>(`/workspaces/${workspace.id}/admin/connectors`),
        apiRequest<SuppressionEntry[]>(`/compliance/suppressions?workspaceId=${workspace.id}`),
        apiRequest<RetentionSummary>(`/workspaces/${workspace.id}/retention`),
      ]);
      setAdminMembers(members);
      setAdminPolicy(policy);
      setAdminConnectors(connectors);
      setSuppressionEntries(suppressions);
      applyRetentionSummary(retention);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Administration data could not load.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function refreshAdminMembers() {
    const response = await apiRequest<AdminMembersResponse>(
      `/workspaces/${workspace.id}/admin/members`,
    );
    setAdminMembers(response);
  }

  async function refreshAdminConnectors() {
    const response = await apiRequest<AdminConnector[]>(
      `/workspaces/${workspace.id}/admin/connectors`,
    );
    setAdminConnectors(response);
  }

  async function runAdminAction(action: () => Promise<void>) {
    setAdminBusy(true);
    setAdminError(null);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Administration action failed.";
      setAdminError(message);
      updateStatus(message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function inviteWorkspaceMember() {
    if (!memberEmail.trim()) {
      setAdminError("Enter a member email address.");
      return;
    }
    await runAdminAction(async () => {
      const response = await apiRequest<
        | { kind: "member"; member: AdminWorkspaceMember }
        | {
            invitation: AdminWorkspaceInvitation;
            inviteToken: string;
            kind: "invitation";
          }
      >(`/workspaces/${workspace.id}/admin/members`, {
        body: { email: memberEmail.trim(), role: memberRole },
        method: "POST",
      });
      if (response.kind === "invitation") {
        setLatestInviteLink(
          `${window.location.origin}/?invite=${encodeURIComponent(response.inviteToken)}`,
        );
        updateStatus("Invitation created. Share the one-time link securely.");
      } else {
        setLatestInviteLink("");
        updateStatus("Existing tenant user added to the workspace.");
      }
      setMemberEmail("");
      await refreshAdminMembers();
    });
  }

  async function copyInviteLink() {
    if (!latestInviteLink) return;
    try {
      await navigator.clipboard.writeText(latestInviteLink);
      updateStatus("Invitation link copied.");
    } catch {
      updateStatus("Copy failed. Select the invitation link manually.");
    }
  }

  async function updateWorkspaceMemberRole(memberId: string, role: WorkspaceRoleName) {
    await runAdminAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/admin/members/${memberId}`, {
        body: { role },
        method: "PATCH",
      });
      await refreshAdminMembers();
      updateStatus("Workspace role updated.");
    });
  }

  async function removeWorkspaceMember(memberId: string) {
    await runAdminAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/admin/members/${memberId}`, {
        method: "DELETE",
      });
      await refreshAdminMembers();
      updateStatus("Workspace member removed.");
    });
  }

  async function revokeWorkspaceInvitation(invitationId: string) {
    await runAdminAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/admin/invitations/${invitationId}`, {
        method: "DELETE",
      });
      await refreshAdminMembers();
      updateStatus("Workspace invitation revoked.");
    });
  }

  async function saveWorkspacePolicy() {
    await runAdminAction(async () => {
      const response = await apiRequest<WorkspacePolicySettings>(
        `/workspaces/${workspace.id}/admin/policy`,
        {
          body: {
            defaultConsentStatus: adminPolicy.defaultConsentStatus,
            defaultPurpose: adminPolicy.defaultPurpose,
            defaultRecipientRegion: adminPolicy.defaultRecipientRegion,
            defaultRecipientType: adminPolicy.defaultRecipientType,
          },
          method: "PUT",
        },
      );
      setAdminPolicy(response);
      setConsentStatus(response.defaultConsentStatus);
      setPolicyPurpose(response.defaultPurpose);
      setRecipientRegion(response.defaultRecipientRegion);
      setRecipientType(response.defaultRecipientType);
      updateStatus("Workspace policy defaults saved.");
    });
  }

  async function createAdminSuppression() {
    if (!adminSuppressionValue.trim() || !adminSuppressionReason.trim()) {
      setAdminError("Suppression value and reason are required.");
      return;
    }
    await runAdminAction(async () => {
      const response = await apiRequest<SuppressionEntry>("/compliance/suppressions", {
        body: {
          channelType: adminSuppressionChannel,
          reason: adminSuppressionReason.trim(),
          source: "workspace_admin",
          value: adminSuppressionValue.trim(),
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setSuppressionEntries((items) => [
        response,
        ...items.filter((item) => item.id !== response.id),
      ]);
      setAdminSuppressionValue("");
      updateStatus("Workspace suppression created.");
    });
  }

  async function configureConnector() {
    await runAdminAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/admin/connectors`, {
        body: {
          displayName: connectorDisplayName.trim() || undefined,
          provider: connectorProvider,
        },
        method: "POST",
      });
      setConnectorDisplayName("");
      await refreshAdminConnectors();
      updateStatus("Approved connector configured.");
    });
  }

  async function updateConnectorStatus(connectorId: string, status: "active" | "paused") {
    await runAdminAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/admin/connectors/${connectorId}`, {
        body: { status },
        method: "PATCH",
      });
      await refreshAdminConnectors();
      updateStatus(`Connector ${status}.`);
    });
  }

  async function syncConnector(connector: AdminConnector) {
    await runAdminAction(async () => {
      const job = await apiRequest<JobStatus>(
        `/workspaces/${workspace.id}/admin/connectors/${connector.id}/sync`,
        {
          body: {
            sourceIdentifier,
            subjectName: subjectName.trim() || undefined,
          },
          headers: { "Idempotency-Key": `connector-sync-${window.crypto.randomUUID()}` },
          method: "POST",
        },
      );
      setJobStatuses((items) => [job, ...items.filter((item) => item.id !== job.id)].slice(0, 20));
      await refreshAdminConnectors();
      updateStatus(`${formatSourceLabel(connector.provider)} synchronization queued.`);
    });
  }

  async function revokeConnector(connectorId: string) {
    await runAdminAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/admin/connectors/${connectorId}`, {
        method: "DELETE",
      });
      await refreshAdminConnectors();
      updateStatus("Connector revoked.");
    });
  }

  async function loadInvitationDetails(token: string) {
    setInviteLoading(true);
    setInviteError(null);
    try {
      const response = await apiRequest<InvitationDetails>(
        `/invitations/${encodeURIComponent(token)}`,
      );
      setInviteDetails(response);
      setInviteDisplayName(response.email.split("@")[0] ?? "New member");
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Invitation could not be loaded.");
    } finally {
      setInviteLoading(false);
    }
  }

  async function acceptWorkspaceInvitation() {
    if (!inviteToken || inviteDisplayName.trim().length < 2 || invitePassword.length < 12) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const response = await apiRequest<AuthResponse>(
        `/invitations/${encodeURIComponent(inviteToken)}/accept`,
        {
          body: { displayName: inviteDisplayName.trim(), password: invitePassword },
          method: "POST",
        },
      );
      const nextAuth = {
        token: response.accessToken,
        userEmail: response.user.email,
        userId: response.user.id,
      };
      setAuth(nextAuth);
      persistSession({ apiBaseUrl, auth: nextAuth });
      setEmail(response.user.email);
      setWorkspaces(response.workspaces);
      setWorkspace(response.workspace);
      closeInvitation();
      await refreshAiConfiguration();
      updateStatus(`Joined ${response.workspace.name}.`);
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : "Invitation could not be accepted.");
    } finally {
      setInviteLoading(false);
    }
  }

  function closeInvitation() {
    setInviteToken("");
    setInviteDetails(null);
    setInvitePassword("");
    setInviteError(null);
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  }

  async function loadDataRequests() {
    try {
      const requests = await apiRequest<UserDataRequest[]>("/users/me/data-requests");
      setDataRequests(requests);
    } catch {
      setDataRequests([]);
    }
  }

  async function requestDataExport() {
    await runAction("privacy", async () => {
      const request = await apiRequest<UserDataRequest>("/users/me/data-exports", {
        method: "POST",
      });
      setDataRequests((items) => [request, ...items.filter((item) => item.id !== request.id)]);
      updateStatus("Your data export is ready to download for 24 hours.");
    });
  }

  async function downloadDataExport(requestId: string) {
    if (!auth) return;
    setBusyAction("privacy");
    try {
      const response = await fetch(`${apiBaseUrl}/users/me/data-exports/${requestId}/download`, {
        headers: { Authorization: `Bearer ${auth.token}` },
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kinship-data-export-${requestId}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      updateStatus("Data export downloaded.");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Data export download failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteAccount() {
    await runAction("privacy", async () => {
      await apiRequest("/users/me/deletion", {
        body: {
          confirmation: deletionConfirmation,
          currentPassword: deletionPassword,
        },
        method: "POST",
      });
      window.sessionStorage.removeItem(sessionStorageKey);
      setAuth(null);
      setWorkspace(demoWorkspace);
      setWorkspaces([demoWorkspace]);
      setDataRequests([]);
      setShowDeleteAccount(false);
      setDeletionPassword("");
      setDeletionConfirmation("");
      setShowSettings(false);
      updateStatus("Account data deleted. You have been signed out.");
    });
  }

  async function analyzeUrl() {
    await runAction("analyze", async () => {
      const job = await apiRequest<JobStatus>("/evidence/jobs", {
        body: {
          sourceIdentifier,
          sourceType,
          subjectName,
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setJobStatuses((items) => [job, ...items.filter((item) => item.id !== job.id)].slice(0, 20));
      updateStatus("Evidence ingestion queued. Progress is available in Trust.");
    });
  }
  async function searchEvidence() {
    await runAction("search", async () => {
      const response = await apiRequest<{
        results: EvidenceItem[];
      }>("/search/evidence", {
        body: {
          limit: retrievalLimit,
          query,
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setEvidence(response.results.length > 0 ? response.results : evidence);
      updateStatus("Evidence search updated.");
    });
  }

  async function searchProspects() {
    await runAction("prospects", async () => {
      const response = await apiRequest<Prospect[]>("/search/prospects", {
        body: {
          limit: retrievalLimit,
          query,
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setProspects(response.length > 0 ? response : prospects);
      setSelectedEntityId(response[0]?.entity.id ?? selectedEntityId);
      updateStatus("Prospect list refreshed.");
    });
  }

  async function refreshProspectLists(preferredListId?: string) {
    if (!auth) {
      return;
    }

    const response = await apiRequest<ProspectListSummary[]>(
      `/workspaces/${workspace.id}/prospect-lists`,
    );
    setProspectLists(response);
    const nextListId =
      preferredListId ??
      (response.some((list) => list.id === activeProspectListId)
        ? activeProspectListId
        : response[0]?.id);
    if (nextListId) {
      await loadProspectList(nextListId);
    } else {
      setActiveProspectListId("");
      setActiveProspectList(null);
      setSavedProspectIds(new Set());
    }
  }

  async function loadProspectList(listId: string) {
    if (!listId) {
      setActiveProspectListId("");
      setActiveProspectList(null);
      setSavedProspectIds(new Set());
      return;
    }

    const detail = await apiRequest<ProspectListDetail>(
      `/workspaces/${workspace.id}/prospect-lists/${listId}`,
    );
    setActiveProspectListId(detail.id);
    setActiveProspectList(detail);
    setProspectListName(detail.name);
    setProspectListDescription(detail.description ?? "");
    setSavedProspectIds(new Set(detail.members.map((member) => member.entity.id)));
    setProspects((current) => {
      const byEntity = new Map(current.map((prospect) => [prospect.entity.id, prospect]));
      for (const member of detail.members) {
        if (!byEntity.has(member.entity.id)) {
          byEntity.set(member.entity.id, {
            entity: {
              canonicalName: member.entity.canonicalName,
              id: member.entity.id,
              type: member.entity.type,
            },
            evidence: [],
            fitScore: member.fitScore ?? 0,
            prospectType: member.entity.person
              ? "person"
              : member.entity.organization
                ? "organization"
                : "entity",
          });
        }
      }
      return [...byEntity.values()];
    });
  }

  async function runProspectListAction(action: () => Promise<void>) {
    setBusyAction("prospects");
    try {
      await action();
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Prospect-list action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function createProspectList() {
    const name = prospectListName.trim();
    if (!auth) {
      updateStatus("Connect the API before creating a durable prospect list.");
      return;
    }
    if (!name) {
      updateStatus("Add a list name before creating it.");
      return;
    }

    await runProspectListAction(async () => {
      const created = await apiRequest<ProspectListSummary>(
        `/workspaces/${workspace.id}/prospect-lists`,
        {
          body: { description: prospectListDescription, name },
          method: "POST",
        },
      );
      await refreshProspectLists(created.id);
      updateStatus(`${created.name} created.`);
    });
  }

  async function updateProspectList() {
    if (!activeProspectListId) {
      updateStatus("Select a prospect list before updating it.");
      return;
    }
    await runProspectListAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/prospect-lists/${activeProspectListId}`, {
        body: {
          description: prospectListDescription,
          name: prospectListName,
        },
        method: "PATCH",
      });
      await refreshProspectLists(activeProspectListId);
      updateStatus("Prospect list updated.");
    });
  }

  async function archiveProspectList() {
    if (!activeProspectListId) {
      return;
    }
    await runProspectListAction(async () => {
      await apiRequest(`/workspaces/${workspace.id}/prospect-lists/${activeProspectListId}`, {
        method: "DELETE",
      });
      await refreshProspectLists();
      updateStatus("Prospect list archived.");
    });
  }

  async function importProspectCsv() {
    if (!activeProspectListId || !prospectCsvText) {
      updateStatus("Choose a list and CSV file before importing.");
      return;
    }
    await runProspectListAction(async () => {
      const result = await apiRequest<ProspectImportResult>(
        `/workspaces/${workspace.id}/prospect-lists/${activeProspectListId}/import`,
        {
          body: { csvText: prospectCsvText, sourceName: prospectCsvName },
          method: "POST",
        },
      );
      setProspectCsvText("");
      setProspectCsvName("");
      await refreshProspectLists(activeProspectListId);
      updateStatus(
        `Imported ${result.rowCount} rows: ${result.addedMembers} added, ${result.updatedMembers} updated.`,
      );
    });
  }

  async function removeProspectListMember(memberId: string) {
    if (!activeProspectListId) {
      return;
    }
    await runProspectListAction(async () => {
      await apiRequest(
        `/workspaces/${workspace.id}/prospect-lists/${activeProspectListId}/members/${memberId}`,
        { method: "DELETE" },
      );
      await refreshProspectLists(activeProspectListId);
      updateStatus("Prospect removed from the list.");
    });
  }

  function resetAiFeedback(targetType: AiFeedbackTargetType) {
    feedbackRequestSequenceRef.current[targetType] += 1;
    setAiFeedback((current) => ({
      ...current,
      [targetType]: createEmptyAiFeedbackState(),
    }));
  }

  function updateAiFeedback(
    targetType: AiFeedbackTargetType,
    update: (current: AiFeedbackFormState) => AiFeedbackFormState,
  ) {
    setAiFeedback((current) => ({ ...current, [targetType]: update(current[targetType]) }));
  }

  async function loadAiFeedback(targetType: AiFeedbackTargetType, targetId: string) {
    const sequence = feedbackRequestSequenceRef.current[targetType] + 1;
    feedbackRequestSequenceRef.current[targetType] = sequence;
    updateAiFeedback(targetType, (current) => ({ ...current, error: null, loading: true }));
    try {
      const response = await apiRequest<AiFeedbackResponse>(
        `/ai-feedback?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`,
      );
      if (feedbackRequestSequenceRef.current[targetType] !== sequence) return;
      setAiFeedback((current) => ({
        ...current,
        [targetType]: toAiFeedbackFormState(response),
      }));
    } catch {
      if (feedbackRequestSequenceRef.current[targetType] !== sequence) return;
      updateAiFeedback(targetType, () => ({
        ...createEmptyAiFeedbackState(),
        error: "Feedback could not be loaded.",
      }));
    }
  }

  function selectAiFeedbackRating(targetType: AiFeedbackTargetType, rating: AiFeedbackRating) {
    updateAiFeedback(targetType, (current) => ({
      ...current,
      error: null,
      rating,
      reason:
        current.rating === rating && current.reason
          ? current.reason
          : (aiFeedbackReasonOptions[rating][0]?.value ?? "other"),
      saved: false,
    }));
  }

  async function submitAiFeedback(targetType: AiFeedbackTargetType) {
    const target = targetType === "brief" ? brief : draft;
    const form = aiFeedback[targetType];
    if (!auth || !target || !form.rating || !form.reason) return;

    updateAiFeedback(targetType, (current) => ({ ...current, error: null, saving: true }));
    try {
      const response = await apiRequest<AiFeedbackResponse>("/ai-feedback", {
        body: {
          comment: form.comment.trim() || undefined,
          rating: form.rating,
          reason: form.reason,
          targetId: target.id,
          targetType,
        },
        method: "POST",
      });
      setAiFeedback((current) => ({
        ...current,
        [targetType]: toAiFeedbackFormState(response),
      }));
      updateStatus(`${targetType === "brief" ? "Brief" : "Draft"} feedback saved.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Feedback could not be saved.";
      updateAiFeedback(targetType, (current) => ({
        ...current,
        error: message,
        saving: false,
      }));
    }
  }

  async function generateBrief() {
    await runAction("brief", async () => {
      const job = await apiRequest<JobStatus>("/relationship-briefs", {
        body: {
          goal,
          subjectEntityId: selectedEntityId,
          workspaceId: workspace.id,
        },
        headers: { "Idempotency-Key": `brief-${window.crypto.randomUUID()}` },
        method: "POST",
      });
      setJobStatuses((items) => [job, ...items.filter((item) => item.id !== job.id)].slice(0, 20));
      updateStatus("Relationship brief generation queued. Progress is available in Trust.");
    });
  }

  async function generateDraft() {
    await runAction("draft", async () => {
      if (!brief) {
        throw new Error("Generate a brief first.");
      }
      const job = await apiRequest<JobStatus>(`/relationship-briefs/${brief.id}/drafts`, {
        body: {
          variant: draftVariant,
        },
        headers: { "Idempotency-Key": `draft-${window.crypto.randomUUID()}` },
        method: "POST",
      });
      setJobStatuses((items) => [job, ...items.filter((item) => item.id !== job.id)].slice(0, 20));
      updateStatus("Draft generation queued. Progress is available in Trust.");
    });
  }

  async function upsertContactChannel() {
    await runAction("contact", async () => {
      await apiRequest("/compliance/contact-channels", {
        body: {
          channelType: channel,
          consentStatus,
          entityId: selectedEntityId,
          label: `Primary ${formatSourceLabel(channel)}`,
          purpose: policyPurpose,
          recipientRegion,
          recipientType,
          value: channelValue,
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      const evaluation = await apiRequest<{
        decision: string;
        reason: string;
        warnings: string[];
      }>("/compliance/evaluate", {
        body: {
          channelType: channel,
          entityId: selectedEntityId,
          sourceType: "user_url",
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setComplianceResult(`${evaluation.decision}: ${evaluation.reason}`);
      setComplianceDecision(evaluation);
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Policy context saved and evaluated.");
    });
  }

  async function refreshContactChannelContext(
    entityId: string,
    channelType: (typeof outreachChannels)[number],
  ) {
    try {
      const response = await apiRequest<ContactChannelPolicyContext[]>(
        `/compliance/contact-channels?workspaceId=${workspace.id}&entityId=${entityId}`,
      );
      const saved = response.find((item) => item.channelType === channelType);
      setConsentStatus(saved?.consentStatus ?? "unknown");
      setPolicyPurpose(saved?.purpose ?? "outreach_review");
      setRecipientType(saved?.recipientType ?? "unknown");
      setRecipientRegion(saved?.recipientRegion ?? "unknown");
    } catch {
      setConsentStatus("unknown");
      setPolicyPurpose("outreach_review");
      setRecipientType("unknown");
      setRecipientRegion("unknown");
    }
  }

  async function createSuppression() {
    await runAction("suppression", async () => {
      const response = await apiRequest<SuppressionEntry>("/compliance/suppressions", {
        body: {
          channelType: channel,
          reason: "Manual opt-out",
          value: channelValue,
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setSuppressionEntries((items) => [
        response,
        ...items.filter((item) => item.id !== response.id),
      ]);
      setComplianceResult("Suppression created. Future email drafts should be blocked.");
      setComplianceDecision({
        decision: "blocked",
        reason: "Suppression created. Future drafts for this channel should be blocked.",
        warnings: ["Suppression entry matched this channel"],
      });
      updateStatus("Suppression entry created.");
    });
  }

  async function evaluateCompliance() {
    await runAction("evaluate", async () => {
      const response = await apiRequest<{
        decision: string;
        reason: string;
        warnings: string[];
      }>("/compliance/evaluate", {
        body: {
          channelType: channel,
          entityId: selectedEntityId,
          sourceType: "user_url",
          workspaceId: workspace.id,
        },
        method: "POST",
      });
      setComplianceResult(`${response.decision}: ${response.reason}`);
      setComplianceDecision(response);
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Compliance evaluation complete.");
    });
  }

  async function refreshSuppressions() {
    await runAction("jobs", async () => {
      const response = await apiRequest<SuppressionEntry[]>(
        `/compliance/suppressions?workspaceId=${workspace.id}`,
      );
      setSuppressionEntries(response);
      updateStatus("Suppression ledger refreshed.");
    });
  }

  async function deleteSuppression(suppressionId: string) {
    await runAction("jobs", async () => {
      await apiRequest(`/compliance/suppressions/${suppressionId}`, {
        method: "DELETE",
      });
      setSuppressionEntries((items) => items.filter((item) => item.id !== suppressionId));
      updateStatus("Suppression entry removed.");
    });
  }

  async function loadJobStatuses() {
    const response = await apiRequest<JobStatus[]>("/evidence/jobs?workspaceId=" + workspace.id);
    setJobStatuses(response);
    for (const job of response) {
      const completed = classifyCompletedJob(job);
      if (!completed || completedJobIdsRef.current.has(job.id)) continue;
      if (completed.kind === "evidence") {
        await hydrateCompletedIngestion(job);
      } else if (completed.kind === "brief") {
        await hydrateCompletedBrief(job, completed.artifactId);
      } else {
        await hydrateCompletedDraft(job, completed.artifactId);
      }
    }
  }

  async function hydrateCompletedBrief(job: JobStatus, briefId: string) {
    const generatedBrief = await apiRequest<Brief>(`/relationship-briefs/${briefId}`);
    completedJobIdsRef.current.add(job.id);
    setBrief(generatedBrief);
    await refreshRelationshipTimeline(selectedEntityId);
    updateStatus("Relationship brief generated.");
  }

  async function hydrateCompletedDraft(job: JobStatus, draftId: string) {
    const generatedDraft = await apiRequest<Draft>(`/drafts/${draftId}`);
    completedJobIdsRef.current.add(job.id);
    setDraft(generatedDraft);
    draftEditSequenceRef.current += 1;
    setIsDraftDirty(false);
    setDraftSaveError(false);
    setDraftSavedAt(generatedDraft.updatedAt);
    setDraftVersions([]);
    setComplianceResult(describeDraftCompliance(generatedDraft));
    setComplianceDecision(toComplianceDecision(generatedDraft));
    await refreshRelationshipTimeline(selectedEntityId);
    updateStatus("Draft generated and compliance checked.");
  }

  async function hydrateCompletedIngestion(job: JobStatus) {
    const entityId = job.progress?.entityId;
    if (!entityId) return;

    const response = await apiRequest<
      Array<{
        confidenceScore: number;
        evidenceSummary: string;
        freshnessScore: number;
        id: string;
        sourceType: string;
      }>
    >("/entities/" + entityId + "/evidence");
    const recoveredEvidence = response.map((item, index) => ({
      confidenceScore: item.confidenceScore,
      entityId,
      evidenceId: item.id,
      freshnessScore: item.freshnessScore,
      rankScore: Math.max(0.5, 0.8 - index * 0.02),
      reasons: ["connector evidence"],
      sourceType: item.sourceType,
      summary: item.evidenceSummary,
    }));

    completedJobIdsRef.current.add(job.id);
    setSelectedEntityId(entityId);
    setEvidence((items) => {
      const recoveredIds = new Set(recoveredEvidence.map((item) => item.evidenceId));
      return [...recoveredEvidence, ...items.filter((item) => !recoveredIds.has(item.evidenceId))];
    });
    updateStatus(
      "Evidence ingestion completed with " +
        (job.progress?.evidenceItemCount ?? recoveredEvidence.length) +
        " signals.",
    );
    if (job.jobName === "connector.sync") await refreshAdminConnectors();
  }

  async function refreshJobStatuses() {
    await runAction("jobs", async () => {
      await loadJobStatuses();
      updateStatus("Ingestion status refreshed.");
    });
  }

  async function retryJob(jobId: string) {
    await runAction("jobs", async () => {
      completedJobIdsRef.current.delete(jobId);
      const job = await apiRequest<JobStatus>("/evidence/jobs/" + jobId + "/retry", {
        method: "POST",
      });
      setJobStatuses((items) => items.map((item) => (item.id === job.id ? job : item)));
      updateStatus("Ingestion retry queued.");
    });
  }

  async function cancelJob(jobId: string) {
    await runAction("jobs", async () => {
      const job = await apiRequest<JobStatus>("/evidence/jobs/" + jobId + "/cancel", {
        method: "POST",
      });
      setJobStatuses((items) => items.map((item) => (item.id === job.id ? job : item)));
      updateStatus("Queued ingestion canceled.");
    });
  }
  async function refreshAudit() {
    await runAction("audit", async () => {
      const response = await apiRequest<AuditEvent[]>(`/audit-events?workspaceId=${workspace.id}`);
      setAuditEvents(response);
      updateStatus("Audit events refreshed.");
    });
  }

  function updateStatus(message: string) {
    setStatus(message);
    setToasts((items) => [
      {
        id: Date.now(),
        message,
        tone: getToastTone(message),
      },
      ...items.slice(0, 2),
    ]);
  }
  async function copyDraft() {
    if (!draft?.body) {
      updateStatus("Generate a draft before copying.");
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.body);
      updateStatus("Draft copied for manual review and sending.");
    } catch {
      updateStatus("Copy failed. Select the draft text manually.");
    }
  }

  async function toggleSelectedProspectSave() {
    if (!selectedProspect) {
      updateStatus("Select a prospect before saving.");
      return;
    }

    const prospectId = selectedProspect.entity.id;
    if (!auth) {
      const willSave = !savedProspectIds.has(prospectId);
      setSavedProspectIds((current) => {
        const next = new Set(current);
        if (willSave) next.add(prospectId);
        else next.delete(prospectId);
        return next;
      });
      updateStatus(willSave ? "Saved in demo state." : "Removed from demo state.");
      return;
    }

    await runProspectListAction(async () => {
      let listId = activeProspectListId;
      if (!listId) {
        const created = await apiRequest<ProspectListSummary>(
          `/workspaces/${workspace.id}/prospect-lists`,
          {
            body: {
              description: "Prospects saved from the relationship workspace.",
              name: "Saved prospects",
            },
            method: "POST",
          },
        );
        listId = created.id;
      }

      const existingMember = activeProspectList?.members.find(
        (member) => member.entity.id === prospectId,
      );
      if (existingMember && activeProspectList?.id === listId) {
        await apiRequest(
          `/workspaces/${workspace.id}/prospect-lists/${listId}/members/${existingMember.id}`,
          { method: "DELETE" },
        );
        updateStatus(`${selectedProspect.entity.canonicalName} removed from the list.`);
      } else {
        await apiRequest(`/workspaces/${workspace.id}/prospect-lists/${listId}/members`, {
          body: {
            entityId: prospectId,
            fitScore: selectedProspect.fitScore,
            relationshipStage: "prospect",
          },
          method: "POST",
        });
        updateStatus(`${selectedProspect.entity.canonicalName} saved to the list.`);
      }
      await refreshProspectLists(listId);
    });
  }

  async function refreshRelationshipNotes(entityId: string) {
    try {
      const response = await apiRequest<RelationshipNoteApi[]>(
        `/workspaces/${workspace.id}/entities/${entityId}/notes`,
      );
      setNotes(response.map(toNoteTimelineItem));
    } catch {
      setNotes([]);
    }
  }

  async function refreshRelationshipTimeline(
    entityId: string,
    options: {
      append?: boolean;
      cursor?: null | string;
      filter?: "all" | RelationshipActivityType;
    } = {},
  ) {
    if (!auth) {
      return;
    }
    const filter = options.filter ?? timelineFilter;
    const query = new URLSearchParams({ limit: "8" });
    if (filter !== "all") {
      query.set("types", filter);
    }
    if (options.cursor) {
      query.set("cursor", options.cursor);
    }
    setTimelineLoading(true);
    try {
      const response = await apiRequest<RelationshipTimelineResponse>(
        `/entities/${entityId}/relationship-timeline?${query.toString()}`,
      );
      setRelationshipActivities((items) =>
        options.append
          ? [...items, ...response.items.filter((item) => !items.some(({ id }) => id === item.id))]
          : response.items,
      );
      setTimelineCursor(response.nextCursor);
    } catch {
      if (!options.append) {
        setRelationshipActivities([]);
        setTimelineCursor(null);
      }
    } finally {
      setTimelineLoading(false);
    }
  }

  function changeTimelineFilter(filter: "all" | RelationshipActivityType) {
    setTimelineFilter(filter);
    if (auth) {
      void refreshRelationshipTimeline(selectedEntityId, { filter });
    }
  }

  async function addNote() {
    const body = noteBody.trim();
    if (!body) {
      updateStatus("Add note text before saving.");
      return;
    }

    if (!auth) {
      const note = createNoteTimelineItem(
        body,
        selectedProspect?.entity.canonicalName ?? subjectName,
      );
      setNotes((items) => [note, ...items]);
      setAuditEvents((items) => [note, ...items]);
      setRelationshipActivities((items) => [
        {
          at: note.createdAt,
          id: `note:${note.id}`,
          sourceId: note.id,
          summary: note.body,
          title: "Relationship note added",
          type: "note",
        },
        ...items,
      ]);
      setNoteBody("");
      updateStatus("Note saved in demo state.");
      return;
    }

    await runAction("notes", async () => {
      const response = await apiRequest<RelationshipNoteApi>(
        `/workspaces/${workspace.id}/entities/${selectedEntityId}/notes`,
        {
          body: { body },
          method: "POST",
        },
      );
      const note = toNoteTimelineItem(response);
      setNotes((items) => [note, ...items.filter((item) => item.id !== note.id)]);
      setAuditEvents((items) => [note, ...items]);
      setNoteBody("");
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Relationship note saved.");
    });
  }

  function startEditingNote(note: NoteTimelineItem) {
    setEditingNoteId(note.id);
    setEditingNoteBody(note.body);
  }

  async function saveNoteEdit(noteId: string) {
    const body = editingNoteBody.trim();
    if (!body) {
      updateStatus("Relationship note cannot be empty.");
      return;
    }
    await runAction("notes", async () => {
      const response = await apiRequest<RelationshipNoteApi>(
        `/workspaces/${workspace.id}/entities/${selectedEntityId}/notes/${noteId}`,
        {
          body: { body },
          method: "PATCH",
        },
      );
      const updated = toNoteTimelineItem(response);
      setNotes((items) => items.map((item) => (item.id === noteId ? updated : item)));
      setEditingNoteId(null);
      setEditingNoteBody("");
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Relationship note updated.");
    });
  }

  async function deleteRelationshipNote(noteId: string) {
    await runAction("notes", async () => {
      await apiRequest(`/workspaces/${workspace.id}/entities/${selectedEntityId}/notes/${noteId}`, {
        method: "DELETE",
      });
      setNotes((items) => items.filter((item) => item.id !== noteId));
      if (editingNoteId === noteId) {
        setEditingNoteId(null);
        setEditingNoteBody("");
      }
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Relationship note deleted.");
    });
  }

  async function recordRelationshipOutcome() {
    const summary = outcomeSummary.trim();
    if (!summary) {
      updateStatus("Describe the outcome before recording it.");
      return;
    }
    if (!auth) {
      const now = new Date().toISOString();
      setRelationshipActivities((items) => [
        {
          at: now,
          id: `outcome:${Date.now()}`,
          sourceId: `demo_outcome_${Date.now()}`,
          status: outcomeKind,
          summary,
          title: formatOutcomeTitle(outcomeKind),
          type: "outcome",
        },
        ...items,
      ]);
      setOutcomeSummary("");
      updateStatus("Outcome recorded in demo state.");
      return;
    }

    await runAction("notes", async () => {
      await apiRequest<RelationshipActivity>(
        `/entities/${selectedEntityId}/relationship-outcomes`,
        {
          body: { kind: outcomeKind, summary },
          method: "POST",
        },
      );
      setOutcomeSummary("");
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Relationship outcome recorded.");
    });
  }

  async function saveDraft(reason: "autosave" | "manual_save"): Promise<Draft | null> {
    if (!draft?.body.trim()) {
      if (reason === "manual_save") {
        updateStatus("Generate or edit a draft before saving.");
      }
      return null;
    }

    if (!auth || draft.id.startsWith("draft_demo")) {
      const savedAt = new Date().toISOString();
      setDraftSavedAt(savedAt);
      setIsDraftDirty(false);
      if (reason === "manual_save") {
        updateStatus("Demo draft saved for this session.");
      }
      return draft;
    }

    const draftAtSave = draft;
    const editSequence = draftEditSequenceRef.current;
    setIsDraftSaving(true);
    setDraftSaveError(false);
    try {
      const response = await apiRequest<Draft>(`/drafts/${draftAtSave.id}`, {
        body: {
          body: draftAtSave.body,
          expectedUpdatedAt: draftAtSave.updatedAt,
          reason,
        },
        method: "PATCH",
      });
      const wasEditedWhileSaving = editSequence !== draftEditSequenceRef.current;
      setDraft((current) =>
        current?.id === response.id && wasEditedWhileSaving
          ? { ...response, body: current.body }
          : response,
      );
      setDraftSavedAt(response.updatedAt);
      if (!wasEditedWhileSaving) {
        setIsDraftDirty(false);
      }
      if (showDraftHistory) {
        await refreshDraftVersions(response.id);
      }
      if (reason === "manual_save") {
        await refreshRelationshipTimeline(selectedEntityId);
        updateStatus("Draft saved to the workspace.");
      }
      return response;
    } catch (error) {
      setDraftSaveError(true);
      if (reason === "manual_save") {
        updateStatus(error instanceof Error ? error.message : "Draft save failed.");
      }
      return null;
    } finally {
      setIsDraftSaving(false);
    }
  }

  async function rewriteDraft() {
    if (!draft) {
      updateStatus("Generate a draft before rewriting it.");
      return;
    }
    const persistedDraft = isDraftDirty ? await saveDraft("manual_save") : draft;
    if (!persistedDraft || persistedDraft.id.startsWith("draft_demo")) {
      updateStatus("Connect the workspace API to rewrite this draft.");
      return;
    }

    setBusyAction("draft");
    try {
      const response = await apiRequest<Draft>(`/drafts/${persistedDraft.id}/rewrite`, {
        body: {
          expectedUpdatedAt: persistedDraft.updatedAt,
          instruction: rewriteInstruction.trim() || undefined,
          variant: draftVariant,
        },
        method: "POST",
      });
      draftEditSequenceRef.current += 1;
      setDraft(response);
      setDraftSavedAt(response.updatedAt);
      setIsDraftDirty(false);
      setDraftSaveError(false);
      setComplianceResult(describeDraftCompliance(response));
      setComplianceDecision(toComplianceDecision(response));
      await refreshDraftVersions(response.id);
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Draft rewritten and compliance checked.");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Draft rewrite failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function validateDraft() {
    if (!draft || draft.id.startsWith("draft_demo")) {
      updateStatus("Connect the workspace API to validate this draft.");
      return;
    }
    const persistedDraft = isDraftDirty ? await saveDraft("manual_save") : draft;
    if (!persistedDraft) {
      return;
    }

    setBusyAction("draft");
    try {
      const response = await apiRequest<Draft>(`/drafts/${persistedDraft.id}/validate`, {
        body: { expectedUpdatedAt: persistedDraft.updatedAt },
        method: "POST",
      });
      setDraft(response);
      setDraftSavedAt(response.updatedAt);
      setComplianceResult(describeDraftCompliance(response));
      setComplianceDecision(toComplianceDecision(response));
      await refreshDraftVersions(response.id);
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Draft evidence and compliance validation complete.");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Draft validation failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function refreshDraftVersions(draftId = draft?.id) {
    if (!draftId || draftId.startsWith("draft_demo")) {
      setDraftVersions([]);
      return;
    }
    const response = await apiRequest<DraftVersion[]>(`/drafts/${draftId}/versions`);
    setDraftVersions(response);
  }

  async function toggleDraftHistory() {
    const next = !showDraftHistory;
    setShowDraftHistory(next);
    if (next) {
      try {
        await refreshDraftVersions();
      } catch (error) {
        updateStatus(error instanceof Error ? error.message : "Draft history could not load.");
      }
    }
  }

  async function restoreDraftVersion(versionId: string) {
    if (!draft || draft.id.startsWith("draft_demo")) {
      return;
    }
    try {
      const response = await apiRequest<Draft>(
        `/drafts/${draft.id}/versions/${versionId}/restore`,
        {
          body: { expectedUpdatedAt: draft.updatedAt },
          method: "POST",
        },
      );
      draftEditSequenceRef.current += 1;
      setDraft(response);
      setDraftSavedAt(response.updatedAt);
      setIsDraftDirty(false);
      setDraftSaveError(false);
      await refreshDraftVersions(response.id);
      await refreshRelationshipTimeline(selectedEntityId);
      updateStatus("Draft version restored as a new revision.");
    } catch (error) {
      updateStatus(error instanceof Error ? error.message : "Draft version restore failed.");
    }
  }
  async function runAction(label: BusyAction, action: () => Promise<void>) {
    setBusyAction(label);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed.";
      updateStatus(label === "privacy" ? message : `${message} Using demo state.`);
      if (label === "brief") {
        setBrief(createDemoBrief());
      }
      if (label === "draft") {
        const nextDraft = createDemoDraft(draftVariant);
        setDraft(nextDraft);
        setComplianceResult(describeDraftCompliance(nextDraft));
      }
      if (label === "prospects") {
        setProspects(initialProspects);
      }
      if (label === "search") {
        setEvidence(initialEvidence);
      }
      if (label === "analyze") {
        const fallback = {
          confidenceScore: 0.72,
          entityId: selectedEntityId,
          evidenceId: `evidence_demo_${Date.now()}`,
          freshnessScore: 0.88,
          rankScore: 0.71,
          reasons: ["demo ingestion"],
          sourceType,
          summary: `${subjectName} has approved demo context from ${sourceIdentifier}.`,
        };
        setEvidence((items) => [fallback, ...items]);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function apiRequest<T = unknown>(
    path: string,
    options: { body?: unknown; headers?: Record<string, string>; method?: string } = {},
  ): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        "Content-Type": "application/json",
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        ...options.headers,
      },
      method: options.method ?? "GET",
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, `API ${response.status} for ${path}`));
    }

    return (await response.json()) as T;
  }

  return (
    <main className={darkMode ? "app-shell theme-dark" : "app-shell"}>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
          </div>
          <div>
            <strong>Kinship</strong>
            <span>Relationship intelligence</span>
          </div>
        </div>

        <nav className="nav-list">
          <button
            aria-current={activeView === "overview" ? "page" : undefined}
            className={activeView === "overview" ? "active" : ""}
            onClick={() => setActiveView("overview")}
            type="button"
          >
            <Home aria-hidden="true" size={18} />
            <span>Workspace</span>
          </button>
          <button
            aria-current={activeView === "discover" ? "page" : undefined}
            className={activeView === "discover" ? "active" : ""}
            onClick={() => setActiveView("discover")}
            type="button"
          >
            <UserRoundSearch aria-hidden="true" size={18} />
            <span>Discover</span>
          </button>
          <button
            aria-current={activeView === "trust" ? "page" : undefined}
            className={activeView === "trust" ? "active" : ""}
            onClick={() => setActiveView("trust")}
            type="button"
          >
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Trust center</span>
            {complianceDecision.decision === "warn" ? <i className="nav-indicator" /> : null}
          </button>
        </nav>

        <div className="sidebar-spacer" />
        <button className="sidebar-utility" onClick={() => setShowSettings(true)} type="button">
          <Settings2 aria-hidden="true" size={18} />
          <span>Settings</span>
        </button>
        <div className="system-status" role="status" aria-live="polite">
          <span className={busyAction ? "status-dot busy" : "status-dot"} />
          <div>
            <strong>{getBusyActionLabel(busyAction)}</strong>
            <span>{busyAction ? status : "All systems ready"}</span>
          </div>
        </div>
        <button className="account-chip" onClick={() => setShowSettings(true)} type="button">
          <span className="avatar avatar-small">{getInitials(auth?.userEmail ?? "Demo User")}</span>
          <span>
            <strong>{auth?.userEmail ?? "Demo workspace"}</strong>
            <small>{workspace.role ?? "owner"}</small>
          </span>
          <ChevronDown aria-hidden="true" size={16} />
        </button>
      </aside>

      <section className="app-main">
        <header className="topbar">
          <div className="mobile-brand">
            <strong>Kinship</strong>
          </div>
          <div className="workspace-switcher">
            <span>{workspace.name}</span>
            <ChevronDown aria-hidden="true" size={15} />
            <select
              aria-label="Workspace"
              onChange={(event) =>
                setWorkspace(workspaces.find((item) => item.id === event.target.value) ?? workspace)
              }
              value={workspace.id}
            >
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className="command-trigger"
            onClick={() => setShowCommandMenu(true)}
            type="button"
          >
            <Search aria-hidden="true" size={16} />
            <span>Search or jump to...</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <button
              aria-label={darkMode ? "Use light theme" : "Use dark theme"}
              className="icon-button"
              onClick={() => setDarkMode((value) => !value)}
              title={darkMode ? "Use light theme" : "Use dark theme"}
              type="button"
            >
              {darkMode ? (
                <Sun aria-hidden="true" size={18} />
              ) : (
                <Moon aria-hidden="true" size={18} />
              )}
            </button>
            <button
              aria-label="Notifications"
              className="icon-button"
              title="Notifications"
              type="button"
            >
              <Bell aria-hidden="true" size={18} />
              <span className="notification-dot" />
            </button>
            <button
              className="primary-button compact"
              onClick={() => setActiveView("discover")}
              type="button"
            >
              <Plus aria-hidden="true" size={17} />
              Add context
            </button>
          </div>
        </header>

        <div className="toast-stack" aria-live="polite" aria-label="Recent updates">
          {toasts.slice(0, 1).map((toast) => (
            <div className={`toast ${toast.tone}`} key={toast.id}>
              <Activity aria-hidden="true" size={17} />
              <p>{toast.message}</p>
            </div>
          ))}
        </div>

        {activeView === "overview" ? (
          <section className="view view-overview" aria-labelledby="workspace-title">
            <div className="view-heading">
              <div>
                <p className="eyebrow">Relationship workspace</p>
                <h1 id="workspace-title">Good evening, {getFirstName(auth?.userEmail)}</h1>
                <p>{currentStep?.description ?? "Your relationship workflow is up to date."}</p>
              </div>
              <div className="workflow-progress" aria-label="Workflow progress">
                <div>
                  <span>{workflowProgress.label}</span>
                  <strong>{workflowProgress.percent}%</strong>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${workflowProgress.percent}%` }} />
                </div>
              </div>
            </div>

            <section className="next-action-bar">
              <span className="next-action-icon">
                <Sparkles aria-hidden="true" size={18} />
              </span>
              <div>
                <span>Next best action</span>
                <strong>{currentStep?.label ?? "Review your relationship brief"}</strong>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  if (!brief) void generateBrief();
                  else if (!draft) void generateDraft();
                  else setActiveView("trust");
                }}
                type="button"
              >
                Continue
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            </section>

            <section className="relationship-workspace">
              <aside className="prospect-pane" aria-label="Prospects">
                <div className="pane-header">
                  <div>
                    <span className="pane-kicker">People</span>
                    <h2>Prospects</h2>
                  </div>
                  <button
                    aria-label="Refresh prospects"
                    className="icon-button subtle"
                    onClick={() => void searchProspects()}
                    title="Refresh prospects"
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" size={16} />
                  </button>
                </div>
                <div className="list-switcher">
                  <select
                    aria-label="Active prospect list"
                    disabled={!auth}
                    onChange={(event) => void loadProspectList(event.target.value)}
                    value={activeProspectListId}
                  >
                    <option value="">All discovered prospects</option>
                    {prospectLists.map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name} ({list._count.members})
                      </option>
                    ))}
                  </select>
                  <button
                    aria-label="Manage prospect lists"
                    className="icon-button subtle"
                    onClick={() => setShowProspectLists(true)}
                    title="Manage prospect lists"
                    type="button"
                  >
                    <Plus aria-hidden="true" size={16} />
                  </button>
                </div>
                <div className="search-field">
                  <Search aria-hidden="true" size={16} />
                  <input
                    aria-label="Search prospects"
                    onChange={(event) => setProspectSearch(event.target.value)}
                    placeholder="Search people"
                    ref={searchInputRef}
                    value={prospectSearch}
                  />
                  <kbd>/</kbd>
                </div>
                <div className="list-toolbar">
                  <button className="filter-button" type="button">
                    <ListFilter aria-hidden="true" size={15} />
                    Filters
                  </button>
                  <label className="sort-control">
                    <span className="sr-only">Sort prospects</span>
                    <select
                      value={prospectSort}
                      onChange={(event) => setProspectSort(event.target.value as ProspectSort)}
                    >
                      <option value="fit">Best fit</option>
                      <option value="saved">Saved first</option>
                      <option value="name">Name</option>
                    </select>
                    <ChevronDown aria-hidden="true" size={14} />
                  </label>
                </div>
                <div className="prospect-list">
                  {filteredProspects.length > 0 ? (
                    filteredProspects.map((prospect) => {
                      const isSelected = prospect.entity.id === selectedEntityId;
                      return (
                        <button
                          className={isSelected ? "prospect-row selected" : "prospect-row"}
                          key={prospect.entity.id}
                          onClick={() => setSelectedEntityId(prospect.entity.id)}
                          type="button"
                        >
                          <span className="avatar">
                            {getInitials(prospect.entity.canonicalName)}
                          </span>
                          <span className="prospect-copy">
                            <strong>{prospect.entity.canonicalName}</strong>
                            <small>
                              {prospect.prospectType}
                              <span aria-hidden="true"> | </span>
                              {prospect.evidence.length} signals
                            </small>
                          </span>
                          <span className="fit-score">{Math.round(prospect.fitScore * 100)}</span>
                        </button>
                      );
                    })
                  ) : (
                    <EmptyState
                      title="No matching prospects"
                      body="Try a broader search or source filter."
                    />
                  )}
                </div>
                <button
                  className="pane-footer-action"
                  onClick={() => setActiveView("discover")}
                  type="button"
                >
                  <Plus aria-hidden="true" size={16} />
                  Discover new people
                </button>
              </aside>

              <article className="insight-pane">
                <header className="profile-header">
                  <div className="avatar avatar-profile">
                    {getInitials(selectedProspect?.entity.canonicalName ?? subjectName)}
                  </div>
                  <div className="profile-copy">
                    <div className="profile-title-row">
                      <h2>{selectedProspect?.entity.canonicalName ?? subjectName}</h2>
                      <span className="status-pill verified">
                        <Check aria-hidden="true" size={12} />
                        Evidence linked
                      </span>
                    </div>
                    <p>Research and developer tools | Trustworthy automation</p>
                    <div className="profile-meta">
                      <span>
                        <Link2 aria-hidden="true" size={14} />
                        {selectedEvidence.length} sources
                      </span>
                      <span>
                        <Clock3 aria-hidden="true" size={14} />
                        Updated today
                      </span>
                    </div>
                  </div>
                  <div className="profile-actions">
                    <button
                      aria-label="Save prospect"
                      className="icon-button"
                      onClick={() => void toggleSelectedProspectSave()}
                      title="Save prospect"
                      type="button"
                    >
                      <Star
                        aria-hidden="true"
                        fill={
                          selectedProspect && savedProspectIds.has(selectedProspect.entity.id)
                            ? "currentColor"
                            : "none"
                        }
                        size={18}
                      />
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => void generateBrief()}
                      type="button"
                    >
                      <Sparkles aria-hidden="true" size={16} />
                      Refresh brief
                    </button>
                  </div>
                </header>

                <div className="score-bar" aria-label="Relationship scores">
                  <ScoreCell label="Fit" value={formatScore(brief?.fitScore)} tone="teal" />
                  <ScoreCell
                    label="Confidence"
                    value={formatScore(brief?.confidenceScore)}
                    tone="navy"
                  />
                  <ScoreCell
                    label="Best channel"
                    value={brief?.recommendedChannel ?? "Unknown"}
                    tone="coral"
                  />
                  <ScoreCell label="Risk" value={workspaceHealth.riskLabel} tone="amber" />
                </div>

                <section className="brief-section">
                  <div className="section-heading">
                    <div>
                      <span className="pane-kicker">Relationship brief</span>
                      <h3>Why this connection matters</h3>
                    </div>
                    <span className="quiet-meta">
                      Grounded in {selectedEvidence.length} sources
                    </span>
                  </div>
                  <p className="brief-summary">
                    {brief?.summary ?? "Generate a brief to synthesize the selected evidence."}
                  </p>
                  {brief?.outreachAngles?.[0] ? (
                    <div className="opportunity-callout">
                      <Sparkles aria-hidden="true" size={17} />
                      <div>
                        <span>Strongest angle</span>
                        <strong>{brief.outreachAngles[0].label}</strong>
                        <p>{brief.outreachAngles[0].rationale}</p>
                      </div>
                    </div>
                  ) : null}
                  <AiFeedbackControl
                    artifactLabel="brief"
                    disabled={!auth || !brief || brief.id.startsWith("brief_demo")}
                    onCommentChange={(comment) =>
                      updateAiFeedback("brief", (current) => ({
                        ...current,
                        comment,
                        saved: false,
                      }))
                    }
                    onRatingChange={(rating) => selectAiFeedbackRating("brief", rating)}
                    onReasonChange={(reason) =>
                      updateAiFeedback("brief", (current) => ({
                        ...current,
                        reason,
                        saved: false,
                      }))
                    }
                    onSubmit={() => void submitAiFeedback("brief")}
                    state={aiFeedback.brief}
                  />
                </section>

                <section className="evidence-section">
                  <div className="section-heading">
                    <div>
                      <span className="pane-kicker">Evidence</span>
                      <h3>Verified signals</h3>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setActiveView("discover")}
                      type="button"
                    >
                      View all
                      <ArrowRight aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <div className="evidence-list">
                    {selectedEvidence.length > 0 ? (
                      selectedEvidence.map((item) => (
                        <article className="evidence-row" key={item.evidenceId}>
                          <span className={`source-icon source-${item.sourceType ?? "default"}`}>
                            <BookOpenText aria-hidden="true" size={17} />
                          </span>
                          <div className="evidence-copy">
                            <div>
                              <span>{formatSourceLabel(item.sourceType)}</span>
                              <span className="evidence-date">Fresh signal</span>
                            </div>
                            <p>{item.summary}</p>
                            <div className="reason-row">
                              {item.reasons.map((reason) => (
                                <span key={reason}>{reason}</span>
                              ))}
                            </div>
                          </div>
                          <div
                            className="confidence-meter"
                            aria-label={`${formatScore(item.confidenceScore)} confidence`}
                          >
                            <strong>{formatScore(item.confidenceScore)}</strong>
                            <span>confidence</span>
                          </div>
                        </article>
                      ))
                    ) : (
                      <EmptyState
                        title="No evidence yet"
                        body="Add approved context to build this brief."
                      />
                    )}
                  </div>
                </section>

                <section className="notes-section relationship-activity-section">
                  <div className="section-heading">
                    <div>
                      <span className="pane-kicker">Timeline</span>
                      <h3>Relationship activity</h3>
                    </div>
                    <button
                      aria-label="Refresh relationship activity"
                      className="icon-button subtle"
                      disabled={timelineLoading}
                      onClick={() => void refreshRelationshipTimeline(selectedEntityId)}
                      title="Refresh activity"
                      type="button"
                    >
                      <RefreshCw
                        aria-hidden="true"
                        className={timelineLoading ? "spin" : ""}
                        size={15}
                      />
                    </button>
                  </div>
                  <div className="activity-filter-row" aria-label="Relationship activity filters">
                    {relationshipActivityFilters.map((filter) => (
                      <button
                        aria-pressed={timelineFilter === filter.id}
                        className={
                          timelineFilter === filter.id ? "filter-chip active" : "filter-chip"
                        }
                        key={filter.id}
                        onClick={() => changeTimelineFilter(filter.id)}
                        type="button"
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                  <div className="note-composer">
                    <MessageSquareText aria-hidden="true" size={17} />
                    <textarea
                      aria-label="Relationship note"
                      onChange={(event) => setNoteBody(event.target.value)}
                      placeholder="Capture context for the next conversation..."
                      value={noteBody}
                    />
                    <button
                      aria-label="Add relationship note"
                      className="icon-button subtle"
                      onClick={() => void addNote()}
                      title="Add note"
                      type="button"
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <div className="outcome-composer">
                    <select
                      aria-label="Relationship outcome type"
                      onChange={(event) =>
                        setOutcomeKind(event.target.value as RelationshipOutcomeKind)
                      }
                      value={outcomeKind}
                    >
                      <option value="follow_up_scheduled">Follow-up scheduled</option>
                      <option value="reply_received">Reply received</option>
                      <option value="meeting_held">Meeting held</option>
                      <option value="introduction_made">Introduction made</option>
                      <option value="opportunity_created">Opportunity created</option>
                      <option value="not_interested">Not interested</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      aria-label="Relationship outcome summary"
                      onChange={(event) => setOutcomeSummary(event.target.value)}
                      placeholder="Record what happened..."
                      value={outcomeSummary}
                    />
                    <button
                      aria-label="Record relationship outcome"
                      className="icon-button subtle"
                      onClick={() => void recordRelationshipOutcome()}
                      title="Record outcome"
                      type="button"
                    >
                      <Check aria-hidden="true" size={15} />
                    </button>
                  </div>
                  <div className="timeline compact-timeline">
                    {timelineLoading && relationshipActivities.length === 0 ? (
                      <div className="activity-loading">
                        <LoaderCircle aria-hidden="true" className="spin" size={16} />
                        Loading activity
                      </div>
                    ) : relationshipActivities.filter(
                        (activity) => timelineFilter === "all" || activity.type === timelineFilter,
                      ).length === 0 ? (
                      <EmptyState
                        title="No activity yet"
                        body="New evidence and decisions will appear here."
                      />
                    ) : (
                      relationshipActivities
                        .filter(
                          (activity) =>
                            timelineFilter === "all" || activity.type === timelineFilter,
                        )
                        .map((activity) => {
                          const note =
                            activity.type === "note"
                              ? notes.find((item) => item.id === activity.sourceId)
                              : undefined;
                          return (
                            <div
                              className={`timeline-row activity-timeline-row activity-${activity.type}`}
                              key={activity.id}
                            >
                              <span className="activity-marker">
                                <RelationshipActivityIcon type={activity.type} />
                              </span>
                              <time dateTime={activity.at}>{formatAuditTime(activity.at)}</time>
                              <div className="note-timeline-copy activity-timeline-copy">
                                <div className="activity-title-row">
                                  <strong>{activity.title}</strong>
                                  {activity.status ? (
                                    <span>{activity.status.replaceAll("_", " ")}</span>
                                  ) : null}
                                </div>
                                {note && editingNoteId === note.id ? (
                                  <textarea
                                    aria-label="Edit relationship note"
                                    onChange={(event) => setEditingNoteBody(event.target.value)}
                                    value={editingNoteBody}
                                  />
                                ) : (
                                  <p>{activity.summary}</p>
                                )}
                                <small>
                                  {activity.actor?.displayName ??
                                    activity.actor?.email ??
                                    note?.authorName ??
                                    "Workspace activity"}
                                  {` | ${formatActivityDate(activity.at)}`}
                                </small>
                              </div>
                              {auth && note?.authorId === auth.userId ? (
                                <div className="note-timeline-actions">
                                  {editingNoteId === note.id ? (
                                    <>
                                      <button
                                        aria-label="Save note changes"
                                        className="icon-button subtle"
                                        onClick={() => void saveNoteEdit(note.id)}
                                        title="Save note changes"
                                        type="button"
                                      >
                                        <Save aria-hidden="true" size={14} />
                                      </button>
                                      <button
                                        aria-label="Cancel note editing"
                                        className="icon-button subtle"
                                        onClick={() => setEditingNoteId(null)}
                                        title="Cancel"
                                        type="button"
                                      >
                                        <X aria-hidden="true" size={14} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        aria-label="Edit relationship note"
                                        className="icon-button subtle"
                                        onClick={() => startEditingNote(note)}
                                        title="Edit note"
                                        type="button"
                                      >
                                        <Pencil aria-hidden="true" size={14} />
                                      </button>
                                      <button
                                        aria-label="Delete relationship note"
                                        className="icon-button subtle"
                                        onClick={() => void deleteRelationshipNote(note.id)}
                                        title="Delete note"
                                        type="button"
                                      >
                                        <Trash2 aria-hidden="true" size={14} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })
                    )}
                  </div>
                  {timelineCursor ? (
                    <button
                      className="secondary-button compact timeline-load-more"
                      disabled={timelineLoading}
                      onClick={() =>
                        void refreshRelationshipTimeline(selectedEntityId, {
                          append: true,
                          cursor: timelineCursor,
                        })
                      }
                      type="button"
                    >
                      {timelineLoading ? (
                        <LoaderCircle aria-hidden="true" className="spin" size={14} />
                      ) : (
                        <Clock3 aria-hidden="true" size={14} />
                      )}
                      Load older
                    </button>
                  ) : null}
                </section>
              </article>

              <aside className="action-pane" aria-label="Outreach composer">
                <div className="pane-header composer-heading">
                  <div>
                    <span className="pane-kicker">Outreach</span>
                    <h2>Draft message</h2>
                  </div>
                  <span className={`status-pill ${formatDraftStatus(draft?.status)}`}>
                    {formatDraftStatus(draft?.status)}
                  </span>
                </div>
                <div className="segmented" role="tablist" aria-label="Draft variant">
                  {draftVariants.map((variant) => (
                    <button
                      aria-selected={draftVariant === variant}
                      className={draftVariant === variant ? "active" : ""}
                      key={variant}
                      onClick={() => setDraftVariant(variant)}
                      role="tab"
                      type="button"
                    >
                      {formatVariantLabel(variant)}
                    </button>
                  ))}
                </div>
                <div className="draft-rewrite-controls">
                  <input
                    aria-label="Rewrite direction"
                    maxLength={500}
                    onChange={(event) => setRewriteInstruction(event.target.value)}
                    placeholder="Rewrite direction"
                    value={rewriteInstruction}
                  />
                  <button
                    className="secondary-button"
                    disabled={!draft || busyAction === "draft"}
                    onClick={() => void rewriteDraft()}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" size={16} />
                    Rewrite
                  </button>
                </div>
                <div className="composer-surface">
                  <textarea
                    aria-label="Draft message body"
                    disabled={!draft}
                    onChange={(event) => {
                      draftEditSequenceRef.current += 1;
                      setIsDraftDirty(true);
                      setDraftSaveError(false);
                      setDraft((current) =>
                        current ? { ...current, body: event.target.value } : current,
                      );
                    }}
                    placeholder="Generate a relationship brief before drafting outreach."
                    value={draft?.body ?? ""}
                  />
                  <div className="composer-meta">
                    <span>{draft?.body.length ?? 0} characters</span>
                    <span className={draftSaveState.tone}>{draftSaveState.label}</span>
                  </div>
                </div>
                <div className="composer-actions">
                  <button
                    className="primary-button"
                    disabled={busyAction === "draft"}
                    onClick={() => void generateDraft()}
                    type="button"
                  >
                    {busyAction === "draft" ? (
                      <LoaderCircle className="spin" aria-hidden="true" size={17} />
                    ) : (
                      <Sparkles aria-hidden="true" size={17} />
                    )}
                    Generate draft
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!draft || busyAction === "draft" || isDraftSaving}
                    onClick={() => void validateDraft()}
                    type="button"
                  >
                    <ShieldCheck aria-hidden="true" size={17} />
                    Validate
                  </button>
                  <button
                    aria-label="Copy draft"
                    className="icon-button"
                    onClick={() => void copyDraft()}
                    title="Copy draft"
                    type="button"
                  >
                    <Copy aria-hidden="true" size={18} />
                  </button>
                  <button
                    aria-label="Draft version history"
                    className={showDraftHistory ? "icon-button active" : "icon-button"}
                    disabled={!draft}
                    onClick={() => void toggleDraftHistory()}
                    title="Version history"
                    type="button"
                  >
                    <Clock3 aria-hidden="true" size={18} />
                  </button>
                  <button
                    aria-label="Save draft"
                    className="icon-button"
                    disabled={!draft || isDraftSaving}
                    onClick={() => void saveDraft("manual_save")}
                    title="Save draft"
                    type="button"
                  >
                    <Save aria-hidden="true" size={18} />
                  </button>
                </div>
                <AiFeedbackControl
                  artifactLabel="draft"
                  disabled={
                    !auth ||
                    !draft ||
                    draft.id.startsWith("draft_demo") ||
                    isDraftDirty ||
                    isDraftSaving
                  }
                  onCommentChange={(comment) =>
                    updateAiFeedback("draft", (current) => ({
                      ...current,
                      comment,
                      saved: false,
                    }))
                  }
                  onRatingChange={(rating) => selectAiFeedbackRating("draft", rating)}
                  onReasonChange={(reason) =>
                    updateAiFeedback("draft", (current) => ({
                      ...current,
                      reason,
                      saved: false,
                    }))
                  }
                  onSubmit={() => void submitAiFeedback("draft")}
                  state={aiFeedback.draft}
                />
                {showDraftHistory ? (
                  <section className="draft-history" aria-label="Draft version history">
                    <div className="section-heading compact-heading">
                      <h3>Version history</h3>
                      <span>{draftVersions.length}</span>
                    </div>
                    {draftVersions.length ? (
                      <div className="draft-version-list">
                        {draftVersions.map((version) => (
                          <div className="draft-version-row" key={version.id}>
                            <div>
                              <strong>Version {version.version}</strong>
                              <small>
                                {version.reason.replaceAll("_", " ")} |{" "}
                                {formatAuditTime(version.createdAt)}
                              </small>
                              <p>{version.body}</p>
                            </div>
                            <button
                              className="text-button"
                              onClick={() => void restoreDraftVersion(version.id)}
                              type="button"
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No versions" body="Saved draft revisions appear here." />
                    )}
                  </section>
                ) : null}
                <section className={`trust-callout ${complianceSummary.tone}`}>
                  <div className="trust-callout-heading">
                    <span>
                      <ShieldCheck aria-hidden="true" size={17} />
                    </span>
                    <div>
                      <strong>{complianceSummary.label}</strong>
                      <p>{complianceSummary.reason}</p>
                    </div>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setActiveView("trust")}
                    type="button"
                  >
                    Review details
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                </section>
                <section className="draft-evidence">
                  <div className="section-heading compact-heading">
                    <h3>Claims in this draft</h3>
                    <span>{draft?.evidenceClaims.length ?? 0}</span>
                  </div>
                  {draft?.evidenceClaims.map((claim) => (
                    <div className="claim-row" key={claim.text}>
                      <FileCheck2 aria-hidden="true" size={16} />
                      <p>{claim.text}</p>
                    </div>
                  )) ?? (
                    <EmptyState
                      title="No claims"
                      body="Generate a draft to inspect its evidence links."
                    />
                  )}
                </section>
              </aside>
            </section>
          </section>
        ) : null}

        {activeView === "discover" ? (
          <section className="view" aria-labelledby="discover-title">
            <div className="view-heading page-heading">
              <div>
                <p className="eyebrow">Approved context only</p>
                <h1 id="discover-title">Discover relationship opportunities</h1>
                <p>Bring a person, source, or question into the evidence workflow.</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => setActiveView("overview")}
                type="button"
              >
                Back to workspace
              </button>
            </div>
            <div className="discover-layout">
              <section className="form-surface">
                <div className="section-heading">
                  <div>
                    <span className="pane-kicker">Source intake</span>
                    <h2>Analyze context</h2>
                  </div>
                  <span className="status-pill verified">
                    <LockKeyhole aria-hidden="true" size={12} />
                    User supplied
                  </span>
                </div>
                <div className="field-grid two">
                  <label>
                    <span>Person or organization</span>
                    <input
                      value={subjectName}
                      onChange={(event) => setSubjectName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Relationship goal</span>
                    <input value={goal} onChange={(event) => setGoal(event.target.value)} />
                  </label>
                </div>
                <label>
                  <span>URL or identifier</span>
                  <div className="input-with-icon">
                    <Link2 aria-hidden="true" size={16} />
                    <input
                      value={sourceIdentifier}
                      onChange={(event) => setSourceIdentifier(event.target.value)}
                    />
                  </div>
                </label>
                <label>
                  <span>Source type</span>
                  <select
                    value={sourceType}
                    onChange={(event) => setSourceType(event.target.value as typeof sourceType)}
                  >
                    {sourceTypes.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" onClick={() => void analyzeUrl()} type="button">
                  <DatabaseZap aria-hidden="true" size={17} />
                  Analyze source
                </button>
              </section>
              <section className="search-surface">
                <div className="section-heading">
                  <div>
                    <span className="pane-kicker">Search</span>
                    <h2>Explore evidence</h2>
                  </div>
                  <div className="button-group">
                    <button
                      className="secondary-button compact"
                      onClick={() => void searchEvidence()}
                      type="button"
                    >
                      Evidence
                    </button>
                    <button
                      className="secondary-button compact"
                      onClick={() => void searchProspects()}
                      type="button"
                    >
                      People
                    </button>
                  </div>
                </div>
                <div className="search-field large">
                  <Search aria-hidden="true" size={17} />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} />
                </div>
                <div className="filter-row" aria-label="Evidence source filters">
                  {sourceFilterOptions.map((item) => (
                    <button
                      className={sourceFilter === item ? "filter-chip active" : "filter-chip"}
                      key={item}
                      onClick={() => setSourceFilter(item)}
                      type="button"
                    >
                      {item === "all" ? "All sources" : formatSourceLabel(item)}
                    </button>
                  ))}
                </div>
                <div className="discovery-results">
                  {filteredProspects.map((prospect) => (
                    <button
                      className="discovery-row"
                      key={prospect.entity.id}
                      onClick={() => {
                        setSelectedEntityId(prospect.entity.id);
                        setActiveView("overview");
                      }}
                      type="button"
                    >
                      <span className="avatar">{getInitials(prospect.entity.canonicalName)}</span>
                      <span>
                        <strong>{prospect.entity.canonicalName}</strong>
                        <small>{prospect.evidence.length} evidence signals</small>
                      </span>
                      <span className="fit-score">{Math.round(prospect.fitScore * 100)}</span>
                      <ArrowRight aria-hidden="true" size={16} />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </section>
        ) : null}

        {activeView === "trust" ? (
          <section className="view" aria-labelledby="trust-title">
            <div className="view-heading page-heading">
              <div>
                <p className="eyebrow">Policy and provenance</p>
                <h1 id="trust-title">Trust center</h1>
                <p>Review consent, suppression, ingestion health, and workspace activity.</p>
              </div>
              <button
                className="secondary-button"
                onClick={() => void evaluateCompliance()}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={16} />
                Recheck policy
              </button>
            </div>
            <div className="trust-dashboard">
              <section className="trust-decision-panel">
                <div className={`decision-hero ${complianceSummary.tone}`}>
                  <span>
                    <ShieldCheck aria-hidden="true" size={24} />
                  </span>
                  <div>
                    <p className="eyebrow">Current decision</p>
                    <h2>{complianceSummary.label}</h2>
                    <p>{complianceSummary.reason}</p>
                  </div>
                </div>
                <div className="field-grid two">
                  <label>
                    <span>Channel</span>
                    <select
                      value={channel}
                      onChange={(event) => setChannel(event.target.value as typeof channel)}
                    >
                      {outreachChannels.map((item) => (
                        <option key={item} value={item}>
                          {formatSourceLabel(item)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Email or handle</span>
                    <input
                      value={channelValue}
                      onChange={(event) => setChannelValue(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>Purpose</span>
                    <select
                      value={policyPurpose}
                      onChange={(event) => setPolicyPurpose(event.target.value as PolicyPurpose)}
                    >
                      <option value="outreach_review">Outreach review</option>
                      <option value="relationship_intelligence">Relationship intelligence</option>
                    </select>
                  </label>
                  <label>
                    <span>Consent</span>
                    <select
                      value={consentStatus}
                      onChange={(event) =>
                        setConsentStatus(event.target.value as typeof consentStatus)
                      }
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="unknown">Unknown</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>
                  </label>
                  <label>
                    <span>Recipient type</span>
                    <select
                      value={recipientType}
                      onChange={(event) => setRecipientType(event.target.value as RecipientType)}
                    >
                      <option value="professional">Professional contact</option>
                      <option value="personal">Personal contact</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </label>
                  <label>
                    <span>Recipient region</span>
                    <select
                      value={recipientRegion}
                      onChange={(event) => setRecipientRegion(event.target.value)}
                    >
                      <option value="unknown">Unknown</option>
                      <option value="india">India</option>
                      <option value="eu_eea">EU / EEA</option>
                      <option value="uk">United Kingdom</option>
                      <option value="us">United States</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </div>
                <div className="button-group">
                  <button
                    className="primary-button"
                    onClick={() => void upsertContactChannel()}
                    type="button"
                  >
                    <Save aria-hidden="true" size={16} />
                    Save channel
                  </button>
                  <button
                    className="danger-button"
                    onClick={() => void createSuppression()}
                    type="button"
                  >
                    <Inbox aria-hidden="true" size={16} />
                    Suppress channel
                  </button>
                </div>
              </section>
              <TrustListPanel
                title="Suppression ledger"
                kicker="Controls"
                onRefresh={() => void refreshSuppressions()}
              >
                {suppressionEntries.length > 0 ? (
                  <div className="trust-list">
                    {suppressionEntries.map((entry) => {
                      const summary = summarizeSuppressionEntry(entry);
                      return (
                        <div className="trust-row" key={entry.id}>
                          <span className="row-icon danger">
                            <LockKeyhole aria-hidden="true" size={16} />
                          </span>
                          <div>
                            <strong>{summary.label}</strong>
                            <span>{summary.detail}</span>
                          </div>
                          <button
                            aria-label="Remove suppression"
                            className="icon-button subtle"
                            onClick={() => void deleteSuppression(entry.id)}
                            title="Remove suppression"
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No active suppressions"
                    body="This workspace has no active suppression entries."
                  />
                )}
              </TrustListPanel>
              <TrustListPanel
                title="Ingestion status"
                kicker="Operations"
                onRefresh={() => void refreshJobStatuses()}
              >
                <div className="trust-list">
                  {jobStatuses.map((job) => {
                    const summary = summarizeJobStatus(job);
                    const percent = Math.max(
                      0,
                      Math.min(
                        100,
                        job.progress?.percent ?? (job.status === "completed" ? 100 : 0),
                      ),
                    );
                    return (
                      <div className="trust-row" key={job.id}>
                        <span className={"row-icon " + summary.tone}>
                          <DatabaseZap aria-hidden="true" size={16} />
                        </span>
                        <div>
                          <strong>{summary.label}</strong>
                          <span>{summary.detail}</span>
                          <progress
                            aria-label={"Job progress " + percent + "%"}
                            className="job-progress"
                            max={100}
                            value={percent}
                          />
                        </div>
                        <div className="job-row-actions">
                          {job.status === "queued" ? (
                            <button
                              aria-label="Cancel queued job"
                              className="icon-button subtle"
                              disabled={busyAction === "jobs"}
                              onClick={() => void cancelJob(job.id)}
                              title="Cancel queued job"
                              type="button"
                            >
                              <X aria-hidden="true" size={15} />
                            </button>
                          ) : null}
                          {job.status === "failed" || job.status === "dead_lettered" ? (
                            <button
                              aria-label="Retry failed job"
                              className="icon-button subtle"
                              disabled={busyAction === "jobs"}
                              onClick={() => void retryJob(job.id)}
                              title="Retry failed job"
                              type="button"
                            >
                              <RefreshCw aria-hidden="true" size={15} />
                            </button>
                          ) : null}
                          <span className={"status-pill " + summary.tone}>{job.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TrustListPanel>
              <TrustListPanel
                title="Recent activity"
                kicker="Workspace"
                onRefresh={() => void refreshAudit()}
                wide
              >
                <div className="timeline">
                  {auditEvents.map((event) => (
                    <div className="timeline-row" key={event.id}>
                      <span>{formatAuditTime(event.createdAt)}</span>
                      <p>{formatAuditEventLabel(event.eventType)}</p>
                    </div>
                  ))}
                </div>
              </TrustListPanel>
            </div>
          </section>
        ) : null}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={activeView === "overview" ? "active" : ""}
          onClick={() => setActiveView("overview")}
          type="button"
        >
          <Home aria-hidden="true" size={19} />
          <span>Workspace</span>
        </button>
        <button
          className={activeView === "discover" ? "active" : ""}
          onClick={() => setActiveView("discover")}
          type="button"
        >
          <UserRoundSearch aria-hidden="true" size={19} />
          <span>Discover</span>
        </button>
        <button
          className={activeView === "trust" ? "active" : ""}
          onClick={() => setActiveView("trust")}
          type="button"
        >
          <ShieldCheck aria-hidden="true" size={19} />
          <span>Trust</span>
        </button>
        <button onClick={() => setShowSettings(true)} type="button">
          <Settings2 aria-hidden="true" size={19} />
          <span>Settings</span>
        </button>
      </nav>

      {showProspectLists ? (
        <div
          className="overlay"
          role="presentation"
          onMouseDown={() => setShowProspectLists(false)}
        >
          <aside
            aria-labelledby="prospect-lists-title"
            aria-modal="true"
            className="settings-drawer prospect-lists-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Relationship workspace</p>
                <h2 id="prospect-lists-title">Prospect lists</h2>
              </div>
              <button
                aria-label="Close prospect lists"
                className="icon-button"
                onClick={() => setShowProspectLists(false)}
                title="Close"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            <section className="drawer-section">
              <div className="section-heading">
                <div>
                  <span className="pane-kicker">Lists</span>
                  <h3>Saved relationship sets</h3>
                </div>
              </div>
              <div className="managed-list-grid">
                {prospectLists.map((list) => (
                  <button
                    className={
                      list.id === activeProspectListId
                        ? "managed-list-row active"
                        : "managed-list-row"
                    }
                    key={list.id}
                    onClick={() => void loadProspectList(list.id)}
                    type="button"
                  >
                    <span>
                      <strong>{list.name}</strong>
                      <small>{list._count.members} members</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={15} />
                  </button>
                ))}
              </div>
              <label>
                <span>List name</span>
                <input
                  maxLength={120}
                  onChange={(event) => setProspectListName(event.target.value)}
                  value={prospectListName}
                />
              </label>
              <label>
                <span>Description</span>
                <textarea
                  maxLength={500}
                  onChange={(event) => setProspectListDescription(event.target.value)}
                  rows={3}
                  value={prospectListDescription}
                />
              </label>
              <div className="button-group">
                <button
                  className="primary-button"
                  onClick={() => void createProspectList()}
                  type="button"
                >
                  <Plus aria-hidden="true" size={16} />
                  New list
                </button>
                <button
                  className="secondary-button"
                  disabled={!activeProspectListId}
                  onClick={() => void updateProspectList()}
                  type="button"
                >
                  <Save aria-hidden="true" size={16} />
                  Save changes
                </button>
                <button
                  aria-label="Archive selected prospect list"
                  className="icon-button"
                  disabled={!activeProspectListId}
                  onClick={() => void archiveProspectList()}
                  title="Archive selected list"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            </section>

            <section className="drawer-section">
              <h3>CSV import</h3>
              <label className="file-picker">
                <Upload aria-hidden="true" size={17} />
                <span>{prospectCsvName || "Choose CSV file"}</span>
                <input
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setProspectCsvName(file.name);
                    void file.text().then(setProspectCsvText);
                  }}
                  type="file"
                />
              </label>
              <button
                className="secondary-button"
                disabled={!activeProspectListId || !prospectCsvText}
                onClick={() => void importProspectCsv()}
                type="button"
              >
                <Upload aria-hidden="true" size={16} />
                Import into selected list
              </button>
              <small className="field-help">
                Required column: name or entity_id. Optional: type, relationship_stage, fit_score,
                confidence_score, email, title, location, notes, and approved profile identifiers.
              </small>
            </section>

            <section className="drawer-section">
              <h3>Members</h3>
              <div className="managed-members">
                {activeProspectList?.members.length ? (
                  activeProspectList.members.map((member) => (
                    <div className="managed-member-row" key={member.id}>
                      <span className="avatar">{getInitials(member.entity.canonicalName)}</span>
                      <span>
                        <strong>{member.entity.canonicalName}</strong>
                        <small>
                          {member.relationshipStage} | {formatScore(member.fitScore)}
                        </small>
                      </span>
                      <button
                        aria-label={`Remove ${member.entity.canonicalName}`}
                        className="icon-button subtle"
                        onClick={() => void removeProspectListMember(member.id)}
                        title="Remove from list"
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </button>
                    </div>
                  ))
                ) : (
                  <EmptyState title="No members yet" body="Save a prospect or import a CSV file." />
                )}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {inviteToken ? (
        <div className="overlay invitation-overlay" role="presentation">
          <div
            aria-labelledby="invitation-title"
            aria-modal="true"
            className="invitation-dialog"
            role="dialog"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Workspace invitation</p>
                <h2 id="invitation-title">Join Kinship</h2>
              </div>
              <button
                aria-label="Close invitation"
                className="icon-button"
                onClick={closeInvitation}
                title="Close invitation"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            {inviteLoading && !inviteDetails ? (
              <div className="admin-loading" role="status">
                <LoaderCircle aria-hidden="true" className="spin" size={18} />
                Checking invitation
              </div>
            ) : null}
            {inviteError ? (
              <div className="inline-error" role="alert">
                {inviteError}
              </div>
            ) : null}
            {inviteDetails ? (
              <div className="invitation-content">
                <div className="invitation-summary">
                  <span className="row-icon">
                    <Inbox aria-hidden="true" size={17} />
                  </span>
                  <span>
                    <strong>{inviteDetails.workspace.name}</strong>
                    <small>
                      {inviteDetails.email} Â· {formatWorkspaceRole(inviteDetails.role)}
                    </small>
                  </span>
                </div>
                <label>
                  <span>Display name</span>
                  <input
                    autoComplete="name"
                    onChange={(event) => setInviteDisplayName(event.target.value)}
                    value={inviteDisplayName}
                  />
                </label>
                <label>
                  <span>Create password</span>
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    onChange={(event) => setInvitePassword(event.target.value)}
                    type="password"
                    value={invitePassword}
                  />
                  <small className="field-help">Use at least 12 characters.</small>
                </label>
                <div className="button-group">
                  <button className="secondary-button" onClick={closeInvitation} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    disabled={
                      inviteLoading ||
                      inviteDisplayName.trim().length < 2 ||
                      invitePassword.length < 12
                    }
                    onClick={() => void acceptWorkspaceInvitation()}
                    type="button"
                  >
                    {inviteLoading ? (
                      <LoaderCircle aria-hidden="true" className="spin" size={16} />
                    ) : (
                      <Check aria-hidden="true" size={16} />
                    )}
                    Accept invitation
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {showSettings ? (
        <div className="overlay" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <aside
            aria-labelledby="settings-title"
            aria-modal="true"
            className="settings-drawer"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Configuration</p>
                <h2 id="settings-title">Workspace settings</h2>
              </div>
              <button
                aria-label="Close settings"
                className="icon-button"
                onClick={() => setShowSettings(false)}
                title="Close settings"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="settings-content">
              <section className="drawer-section">
                <h3>Kinship backend</h3>
                <label>
                  <span>Kinship API URL</span>
                  <input
                    value={apiBaseUrl}
                    onChange={(event) => setApiBaseUrl(event.target.value)}
                  />
                </label>
                <div className="system-status" role="status">
                  <span
                    className={aiConfiguration?.configured ? "status-dot" : "status-dot busy"}
                  />
                  <div>
                    <strong>
                      {aiConfiguration?.provider === "openai-compatible"
                        ? "OpenAI configured"
                        : aiConfiguration?.provider === "mock"
                          ? "Demo AI configured"
                          : "AI status unavailable"}
                    </strong>
                    <span>{aiConfiguration?.model ?? "Check the Kinship backend connection"}</span>
                  </div>
                </div>
                <div className="field-grid two">
                  <label>
                    <span>Email</span>
                    <input value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                  <label>
                    <span>Password</span>
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                </div>
                <label>
                  <span>Workspace name</span>
                  <input
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                  />
                </label>
                {auth ? (
                  <div className="button-group">
                    <button
                      className="secondary-button"
                      disabled={busyAction === "logout"}
                      onClick={() => void logout()}
                      type="button"
                    >
                      Sign out
                    </button>
                  </div>
                ) : (
                  <div className="button-group">
                    <button
                      className="primary-button"
                      disabled={busyAction === "register"}
                      onClick={() => void register()}
                      type="button"
                    >
                      Register workspace
                    </button>
                    <button className="secondary-button" onClick={() => void login()} type="button">
                      Sign in
                    </button>
                  </div>
                )}
              </section>
              <section className="drawer-section">
                <h3>Run preferences</h3>
                <label>
                  <span>Retrieval limit</span>
                  <input
                    min="1"
                    max="10"
                    type="number"
                    value={retrievalLimit}
                    onChange={(event) => setRetrievalLimit(Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Draft channel</span>
                  <select
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as typeof channel)}
                  >
                    {outreachChannels.map((item) => (
                      <option key={item} value={item}>
                        {item === "email" ? "Email" : "LinkedIn context"}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              {auth && isWorkspaceAdmin(workspace) ? (
                <section
                  className="drawer-section admin-console"
                  aria-labelledby="admin-console-title"
                >
                  <div className="admin-console-header">
                    <div>
                      <h3 id="admin-console-title">Workspace administration</h3>
                      <p className="field-help">
                        Manage access, workflow defaults, opt-outs, and approved context providers.
                      </p>
                    </div>
                    <button
                      aria-label="Refresh administration data"
                      className="icon-button subtle"
                      disabled={adminLoading || adminBusy}
                      onClick={() => void loadAdminData()}
                      title="Refresh administration data"
                      type="button"
                    >
                      <RefreshCw aria-hidden="true" size={16} />
                    </button>
                  </div>
                  <div className="admin-tabs" role="tablist" aria-label="Administration areas">
                    {adminTabs.map((item) => (
                      <button
                        aria-selected={adminTab === item.id}
                        className={adminTab === item.id ? "active" : ""}
                        key={item.id}
                        onClick={() => setAdminTab(item.id)}
                        role="tab"
                        type="button"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {adminError ? (
                    <div className="inline-error" role="alert">
                      {adminError}
                    </div>
                  ) : null}
                  {adminLoading ? (
                    <div className="admin-loading" role="status">
                      <LoaderCircle aria-hidden="true" className="spin" size={18} />
                      Loading workspace administration
                    </div>
                  ) : (
                    <>
                      {adminTab === "members" ? (
                        <div className="admin-panel" role="tabpanel">
                          <div className="admin-form-row">
                            <label>
                              <span>Email address</span>
                              <input
                                autoComplete="email"
                                onChange={(event) => setMemberEmail(event.target.value)}
                                placeholder="teammate@company.com"
                                type="email"
                                value={memberEmail}
                              />
                            </label>
                            <label>
                              <span>Role</span>
                              <select
                                onChange={(event) =>
                                  setMemberRole(event.target.value as WorkspaceRoleName)
                                }
                                value={memberRole}
                              >
                                {workspaceRoleOptions.map((role) => (
                                  <option
                                    disabled={role.value === "owner" && workspace.role !== "owner"}
                                    key={role.value}
                                    value={role.value}
                                  >
                                    {role.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              className="primary-button admin-submit"
                              disabled={adminBusy || !memberEmail.trim()}
                              onClick={() => void inviteWorkspaceMember()}
                              type="button"
                            >
                              <Plus aria-hidden="true" size={16} />
                              Add
                            </button>
                          </div>
                          {latestInviteLink ? (
                            <div className="invite-link-row">
                              <label>
                                <span>One-time invitation link</span>
                                <input readOnly value={latestInviteLink} />
                              </label>
                              <button
                                aria-label="Copy invitation link"
                                className="icon-button"
                                onClick={() => void copyInviteLink()}
                                title="Copy invitation link"
                                type="button"
                              >
                                <Copy aria-hidden="true" size={16} />
                              </button>
                            </div>
                          ) : null}
                          <div className="admin-list">
                            {adminMembers.members.length ? (
                              adminMembers.members.map((member) => (
                                <div className="admin-member-row" key={member.id}>
                                  <span className="avatar">
                                    {getInitials(member.user.displayName ?? member.user.email)}
                                  </span>
                                  <span className="admin-row-copy">
                                    <strong>{member.user.displayName ?? member.user.email}</strong>
                                    <small>{member.user.email}</small>
                                  </span>
                                  <select
                                    aria-label={`Role for ${member.user.email}`}
                                    disabled={
                                      adminBusy ||
                                      (member.role === "owner" && workspace.role !== "owner")
                                    }
                                    onChange={(event) =>
                                      void updateWorkspaceMemberRole(
                                        member.id,
                                        event.target.value as WorkspaceRoleName,
                                      )
                                    }
                                    value={member.role}
                                  >
                                    {workspaceRoleOptions.map((role) => (
                                      <option
                                        disabled={
                                          role.value === "owner" && workspace.role !== "owner"
                                        }
                                        key={role.value}
                                        value={role.value}
                                      >
                                        {role.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    aria-label={`Remove ${member.user.email}`}
                                    className="icon-button subtle"
                                    disabled={
                                      adminBusy ||
                                      (member.role === "owner" && workspace.role !== "owner")
                                    }
                                    onClick={() => void removeWorkspaceMember(member.id)}
                                    title="Remove member"
                                    type="button"
                                  >
                                    <Trash2 aria-hidden="true" size={15} />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <EmptyState
                                title="No active members"
                                body="Invite the first collaborator."
                              />
                            )}
                          </div>
                          {adminMembers.invitations.length ? (
                            <div className="admin-list pending-list">
                              <span className="admin-list-label">Pending invitations</span>
                              {adminMembers.invitations.map((invitation) => (
                                <div className="admin-invitation-row" key={invitation.id}>
                                  <span className="row-icon">
                                    <Inbox aria-hidden="true" size={15} />
                                  </span>
                                  <span className="admin-row-copy">
                                    <strong>{invitation.email}</strong>
                                    <small>
                                      {formatWorkspaceRole(invitation.role)} Â· Expires{" "}
                                      {formatActivityDate(invitation.expiresAt)}
                                    </small>
                                  </span>
                                  <button
                                    aria-label={`Revoke invitation for ${invitation.email}`}
                                    className="icon-button subtle"
                                    disabled={adminBusy}
                                    onClick={() => void revokeWorkspaceInvitation(invitation.id)}
                                    title="Revoke invitation"
                                    type="button"
                                  >
                                    <X aria-hidden="true" size={15} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {adminTab === "policy" ? (
                        <div className="admin-panel" role="tabpanel">
                          <p className="field-help">
                            Defaults prefill new workflows. Deterministic policy checks still
                            evaluate every draft and cannot be bypassed here.
                          </p>
                          <div className="field-grid two">
                            <label>
                              <span>Default purpose</span>
                              <select
                                onChange={(event) =>
                                  setAdminPolicy((current) => ({
                                    ...current,
                                    defaultPurpose: event.target.value as PolicyPurpose,
                                  }))
                                }
                                value={adminPolicy.defaultPurpose}
                              >
                                <option value="outreach_review">Outreach review</option>
                                <option value="relationship_intelligence">
                                  Relationship intelligence
                                </option>
                              </select>
                            </label>
                            <label>
                              <span>Default consent</span>
                              <select
                                onChange={(event) =>
                                  setAdminPolicy((current) => ({
                                    ...current,
                                    defaultConsentStatus: event.target
                                      .value as WorkspacePolicySettings["defaultConsentStatus"],
                                  }))
                                }
                                value={adminPolicy.defaultConsentStatus}
                              >
                                <option value="unknown">Unknown</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="withdrawn">Withdrawn</option>
                              </select>
                            </label>
                            <label>
                              <span>Recipient type</span>
                              <select
                                onChange={(event) =>
                                  setAdminPolicy((current) => ({
                                    ...current,
                                    defaultRecipientType: event.target.value as RecipientType,
                                  }))
                                }
                                value={adminPolicy.defaultRecipientType}
                              >
                                <option value="unknown">Unknown</option>
                                <option value="professional">Professional contact</option>
                                <option value="personal">Personal contact</option>
                              </select>
                            </label>
                            <label>
                              <span>Recipient region</span>
                              <input
                                onChange={(event) =>
                                  setAdminPolicy((current) => ({
                                    ...current,
                                    defaultRecipientRegion: event.target.value,
                                  }))
                                }
                                placeholder="unknown, US, EU"
                                value={adminPolicy.defaultRecipientRegion}
                              />
                            </label>
                          </div>
                          <button
                            className="primary-button admin-action"
                            disabled={
                              adminBusy || adminPolicy.defaultRecipientRegion.trim().length < 2
                            }
                            onClick={() => void saveWorkspacePolicy()}
                            type="button"
                          >
                            <Save aria-hidden="true" size={16} />
                            Save defaults
                          </button>
                        </div>
                      ) : null}

                      {adminTab === "suppressions" ? (
                        <div className="admin-panel" role="tabpanel">
                          <div className="field-grid two">
                            <label>
                              <span>Channel</span>
                              <select
                                onChange={(event) =>
                                  setAdminSuppressionChannel(
                                    event.target.value as typeof adminSuppressionChannel,
                                  )
                                }
                                value={adminSuppressionChannel}
                              >
                                <option value="email">Email</option>
                                <option value="linkedin_context">LinkedIn context</option>
                              </select>
                            </label>
                            <label>
                              <span>Recipient</span>
                              <input
                                onChange={(event) => setAdminSuppressionValue(event.target.value)}
                                placeholder="person@example.com"
                                value={adminSuppressionValue}
                              />
                            </label>
                          </div>
                          <label>
                            <span>Reason</span>
                            <input
                              onChange={(event) => setAdminSuppressionReason(event.target.value)}
                              value={adminSuppressionReason}
                            />
                          </label>
                          <button
                            className="primary-button admin-action"
                            disabled={
                              adminBusy ||
                              !adminSuppressionValue.trim() ||
                              !adminSuppressionReason.trim()
                            }
                            onClick={() => void createAdminSuppression()}
                            type="button"
                          >
                            <LockKeyhole aria-hidden="true" size={16} />
                            Add suppression
                          </button>
                          <div className="admin-list">
                            {suppressionEntries.length ? (
                              suppressionEntries.map((entry) => {
                                const summary = summarizeSuppressionEntry(entry);
                                return (
                                  <div className="admin-invitation-row" key={entry.id}>
                                    <span className="row-icon danger">
                                      <LockKeyhole aria-hidden="true" size={15} />
                                    </span>
                                    <span className="admin-row-copy">
                                      <strong>{summary.label}</strong>
                                      <small>{summary.detail}</small>
                                    </span>
                                    <button
                                      aria-label="Remove suppression"
                                      className="icon-button subtle"
                                      disabled={adminBusy}
                                      onClick={() => void deleteSuppression(entry.id)}
                                      title="Remove suppression"
                                      type="button"
                                    >
                                      <Trash2 aria-hidden="true" size={15} />
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <EmptyState
                                title="No workspace suppressions"
                                body="Add an opt-out before preparing outreach."
                              />
                            )}
                          </div>
                        </div>
                      ) : null}

                      {adminTab === "connectors" ? (
                        <div className="admin-panel" role="tabpanel">
                          <p className="field-help">
                            Approved public-context providers only. Credentials remain
                            backend-managed. Sync uses the current URL or identifier and subject
                            from the intake workspace.
                          </p>
                          <div className="admin-form-row">
                            <label>
                              <span>Provider</span>
                              <select
                                onChange={(event) =>
                                  setConnectorProvider(
                                    event.target.value as typeof connectorProvider,
                                  )
                                }
                                value={connectorProvider}
                              >
                                {adminConnectorProviders.map((provider) => (
                                  <option key={provider} value={provider}>
                                    {formatSourceLabel(provider)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Display name</span>
                              <input
                                onChange={(event) => setConnectorDisplayName(event.target.value)}
                                placeholder="Research GitHub"
                                value={connectorDisplayName}
                              />
                            </label>
                            <button
                              className="primary-button admin-submit"
                              disabled={adminBusy}
                              onClick={() => void configureConnector()}
                              type="button"
                            >
                              <Plus aria-hidden="true" size={16} />
                              Add
                            </button>
                          </div>
                          <div className="admin-list">
                            {adminConnectors.length ? (
                              adminConnectors.map((connector) => (
                                <div className="admin-connector-row" key={connector.id}>
                                  <span className="row-icon">
                                    <Link2 aria-hidden="true" size={15} />
                                  </span>
                                  <span className="admin-row-copy">
                                    <strong>
                                      {connector.displayName ??
                                        formatSourceLabel(connector.provider)}
                                    </strong>
                                    <small>
                                      {formatSourceLabel(connector.provider)}
                                      {connector.runs[0]
                                        ? ` Â· Last run ${connector.runs[0].status}`
                                        : " Â· Not run yet"}
                                    </small>
                                  </span>
                                  <select
                                    aria-label={`Status for ${connector.displayName ?? connector.provider}`}
                                    disabled={adminBusy || connector.status === "revoked"}
                                    onChange={(event) =>
                                      void updateConnectorStatus(
                                        connector.id,
                                        event.target.value as "active" | "paused",
                                      )
                                    }
                                    value={
                                      connector.status === "revoked" ? "paused" : connector.status
                                    }
                                  >
                                    <option value="active">Active</option>
                                    <option value="paused">Paused</option>
                                  </select>
                                  <button
                                    aria-label={`Sync ${connector.displayName ?? connector.provider}`}
                                    className="icon-button subtle"
                                    disabled={
                                      adminBusy ||
                                      connector.status !== "active" ||
                                      !sourceIdentifier.trim()
                                    }
                                    onClick={() => void syncConnector(connector)}
                                    title="Sync current source"
                                    type="button"
                                  >
                                    <RefreshCw aria-hidden="true" size={15} />
                                  </button>
                                  <button
                                    aria-label={`Revoke ${connector.displayName ?? connector.provider}`}
                                    className="icon-button subtle"
                                    disabled={adminBusy || connector.status === "revoked"}
                                    onClick={() => void revokeConnector(connector.id)}
                                    title="Revoke connector"
                                    type="button"
                                  >
                                    <Trash2 aria-hidden="true" size={15} />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <EmptyState
                                title="No approved connectors"
                                body="Configure a context provider for this workspace."
                              />
                            )}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}{" "}
              {auth && (workspace.role === "owner" || workspace.role === "admin") ? (
                <section className="drawer-section" aria-labelledby="retention-settings-title">
                  <div>
                    <h3 id="retention-settings-title">Evidence retention</h3>
                    <p className="field-help">
                      Applies to evidence and its source snapshots. Expired records are removed by
                      the scheduled cleanup worker.
                    </p>
                  </div>
                  <label className="toggle-row">
                    <input
                      checked={retentionEnabled}
                      onChange={(event) => setRetentionEnabled(event.target.checked)}
                      type="checkbox"
                    />
                    <span>
                      <strong>Automatic expiration</strong>
                      <small>Schedule deletion from each item&apos;s retrieval date.</small>
                    </span>
                  </label>
                  <label>
                    <span>Retention window</span>
                    <div className="input-suffix">
                      <input
                        disabled={!retentionEnabled}
                        max="3650"
                        min="1"
                        onChange={(event) => setRetentionDays(Number(event.target.value))}
                        type="number"
                        value={retentionDays}
                      />
                      <span>days</span>
                    </div>
                  </label>
                  <div className="retention-metrics" role="status" aria-live="polite">
                    <span>
                      <small>Due now</small>
                      <strong>{retentionSummary?.preview.totalDue ?? 0}</strong>
                    </span>
                    <span>
                      <small>Next expiration</small>
                      <strong>
                        {formatRetentionDate(retentionSummary?.preview.nextExpirationAt)}
                      </strong>
                    </span>
                  </div>
                  {retentionSummary?.lastRun ? (
                    <p className="field-help">
                      Last cleanup: {summarizeJobStatus(retentionSummary.lastRun).label}
                      {retentionSummary.lastRun.updatedAt
                        ? ` on ${formatActivityDate(retentionSummary.lastRun.updatedAt)}`
                        : ""}
                    </p>
                  ) : (
                    <p className="field-help">No cleanup run has been recorded yet.</p>
                  )}
                  <div className="button-group">
                    <button
                      className="primary-button"
                      disabled={retentionDays < 1 || retentionDays > 3650}
                      onClick={() => void saveRetentionPolicy()}
                      type="button"
                    >
                      <Save aria-hidden="true" size={16} />
                      Save policy
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => void previewRetentionCleanup()}
                      type="button"
                    >
                      <RefreshCw aria-hidden="true" size={16} />
                      Preview
                    </button>
                    <button
                      className="danger-button"
                      disabled={(retentionSummary?.preview.totalDue ?? 0) === 0}
                      onClick={() => setConfirmRetentionCleanup(true)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                      Run cleanup
                    </button>
                  </div>
                  {confirmRetentionCleanup ? (
                    <div className="retention-confirmation" role="alert">
                      <p>
                        Permanently delete {retentionSummary?.preview.totalDue ?? 0} expired
                        evidence records and snapshots? This cannot be undone.
                      </p>
                      <div className="button-group">
                        <button
                          className="secondary-button compact"
                          onClick={() => setConfirmRetentionCleanup(false)}
                          type="button"
                        >
                          Cancel
                        </button>
                        <button
                          className="danger-button compact"
                          onClick={() => void executeRetentionCleanup()}
                          type="button"
                        >
                          Delete expired data
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
              {auth ? (
                <section className="drawer-section" aria-labelledby="privacy-settings-title">
                  <div>
                    <h3 id="privacy-settings-title">Data &amp; privacy</h3>
                    <p className="field-help">Manage your account data and privacy lifecycle.</p>
                  </div>
                  <div className="privacy-action-row">
                    <div>
                      <strong>Data export</strong>
                      <span>Account details, memberships, authored content, and activity.</span>
                    </div>
                    <button
                      className="secondary-button compact"
                      disabled={busyAction === "privacy"}
                      onClick={() => void requestDataExport()}
                      type="button"
                    >
                      <Download aria-hidden="true" size={16} />
                      {latestDataExport?.downloadAvailable ? "Refresh export" : "Prepare export"}
                    </button>
                  </div>
                  {latestDataExport ? (
                    <div className="privacy-request-status" role="status" aria-live="polite">
                      <span>
                        <strong>
                          {latestDataExport.downloadAvailable
                            ? "Export ready"
                            : latestDataExport.status === "failed"
                              ? "Export failed"
                              : latestDataExport.status === "processing"
                                ? "Preparing export"
                                : "Export expired"}
                        </strong>
                        <small>
                          {latestDataExport.downloadAvailable && latestDataExport.expiresAt
                            ? `Available until ${formatRetentionDate(latestDataExport.expiresAt)}`
                            : (latestDataExport.failureReason ??
                              "Request a fresh export when needed.")}
                        </small>
                      </span>
                      {latestDataExport.downloadAvailable ? (
                        <button
                          aria-label="Download data export"
                          className="icon-button"
                          onClick={() => void downloadDataExport(latestDataExport.id)}
                          title="Download data export"
                          type="button"
                        >
                          <Download aria-hidden="true" size={17} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="privacy-danger-zone">
                    <div>
                      <strong>Delete account</strong>
                      <span>Removes your profile, memberships, notes, and direct attribution.</span>
                    </div>
                    {!showDeleteAccount ? (
                      <button
                        className="danger-button compact"
                        onClick={() => setShowDeleteAccount(true)}
                        type="button"
                      >
                        <UserX aria-hidden="true" size={16} />
                        Delete account
                      </button>
                    ) : (
                      <div className="retention-confirmation privacy-confirmation" role="alert">
                        <p>
                          This signs you out immediately. Shared workspaces require another owner
                          before your account can be deleted.
                        </p>
                        <label>
                          <span>Current password</span>
                          <input
                            autoComplete="current-password"
                            onChange={(event) => setDeletionPassword(event.target.value)}
                            type="password"
                            value={deletionPassword}
                          />
                        </label>
                        <label>
                          <span>Type DELETE MY ACCOUNT</span>
                          <input
                            autoComplete="off"
                            onChange={(event) => setDeletionConfirmation(event.target.value)}
                            value={deletionConfirmation}
                          />
                        </label>
                        <div className="button-group">
                          <button
                            className="secondary-button compact"
                            onClick={() => {
                              setShowDeleteAccount(false);
                              setDeletionPassword("");
                              setDeletionConfirmation("");
                            }}
                            type="button"
                          >
                            Cancel
                          </button>
                          <button
                            className="danger-button compact"
                            disabled={
                              busyAction === "privacy" ||
                              deletionPassword.length === 0 ||
                              deletionConfirmation !== "DELETE MY ACCOUNT"
                            }
                            onClick={() => void deleteAccount()}
                            type="button"
                          >
                            Permanently delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {showCommandMenu ? (
        <div
          className="overlay command-overlay"
          role="presentation"
          onMouseDown={() => setShowCommandMenu(false)}
        >
          <div
            aria-labelledby="command-title"
            aria-modal="true"
            className="command-menu"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="command-search">
              <Search aria-hidden="true" size={18} />
              <span id="command-title">Jump to a workspace</span>
              <kbd>Esc</kbd>
            </div>
            <div className="command-list">
              <CommandItem
                icon={<Home aria-hidden="true" size={17} />}
                label="Workspace"
                detail="Relationship brief and outreach"
                shortcut="G W"
                onClick={() => {
                  setActiveView("overview");
                  setShowCommandMenu(false);
                }}
              />
              <CommandItem
                icon={<UserRoundSearch aria-hidden="true" size={17} />}
                label="Discover"
                detail="Analyze sources and find people"
                shortcut="G D"
                onClick={() => {
                  setActiveView("discover");
                  setShowCommandMenu(false);
                }}
              />
              <CommandItem
                icon={<ShieldCheck aria-hidden="true" size={17} />}
                label="Trust center"
                detail="Consent, suppression, and audit"
                shortcut="G T"
                onClick={() => {
                  setActiveView("trust");
                  setShowCommandMenu(false);
                }}
              />
              <CommandItem
                icon={<Settings2 aria-hidden="true" size={17} />}
                label="Settings"
                detail="Backend connection and preferences"
                shortcut="G S"
                onClick={() => {
                  setShowSettings(true);
                  setShowCommandMenu(false);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function readPersistedSession(): PersistedSession | null {
  try {
    const value = window.sessionStorage.getItem(sessionStorageKey);
    if (!value) return null;

    const parsed = JSON.parse(value) as Partial<PersistedSession>;
    if (
      typeof parsed.apiBaseUrl !== "string" ||
      typeof parsed.auth?.token !== "string" ||
      typeof parsed.auth.userEmail !== "string" ||
      typeof parsed.auth.userId !== "string"
    ) {
      return null;
    }

    return parsed as PersistedSession;
  } catch {
    return null;
  }
}

function persistSession(session: PersistedSession) {
  window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
}

function ScoreCell({ label, tone, value }: { label: string; tone: string; value: string }) {
  return (
    <div className="score-cell">
      <span>{label}</span>
      <strong className={`score-${tone}`}>{value}</strong>
    </div>
  );
}

function TrustListPanel({
  children,
  kicker,
  onRefresh,
  title,
  wide = false,
}: {
  children: ReactNode;
  kicker: string;
  onRefresh: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <section className={wide ? "trust-list-panel audit-panel" : "trust-list-panel"}>
      <div className="section-heading">
        <div>
          <span className="pane-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        <button
          aria-label={`Refresh ${title}`}
          className="icon-button"
          onClick={onRefresh}
          title={`Refresh ${title}`}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={16} />
        </button>
      </div>
      {children}
    </section>
  );
}

function CommandItem({
  detail,
  icon,
  label,
  onClick,
  shortcut,
}: {
  detail: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  shortcut: string;
}) {
  return (
    <button onClick={onClick} type="button">
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}

function isWorkspaceAdmin(workspace: Workspace): boolean {
  return workspace.role === "owner" || workspace.role === "admin";
}

function createDefaultWorkspacePolicy(workspaceId: string): WorkspacePolicySettings {
  return {
    defaultConsentStatus: "unknown",
    defaultPurpose: "outreach_review",
    defaultRecipientRegion: "unknown",
    defaultRecipientType: "unknown",
    id: null,
    workspaceId,
  };
}

function formatWorkspaceRole(role: WorkspaceRoleName): string {
  return workspaceRoleOptions.find((option) => option.value === role)?.label ?? role;
}
function getInitials(value: string): string {
  return (
    value
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item[0]?.toUpperCase())
      .join("") || "RI"
  );
}

function getFirstName(value?: string): string {
  if (!value) return "there";
  const local = value.split("@")[0] ?? "there";
  return local.split(/[._-]/)[0] || "there";
}

function formatSourceLabel(value?: string): string {
  if (!value) return "Source";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatVariantLabel(value: Draft["variant"]): string {
  if (value === "warm_professional") return "Warm";
  if (value === "evidence_heavy") return "Detailed";
  return "Concise";
}
function EmptyState({ body, title }: { body: string; title: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function AiFeedbackControl({
  artifactLabel,
  disabled,
  onCommentChange,
  onRatingChange,
  onReasonChange,
  onSubmit,
  state,
}: {
  artifactLabel: "brief" | "draft";
  disabled: boolean;
  onCommentChange: (comment: string) => void;
  onRatingChange: (rating: AiFeedbackRating) => void;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
  state: AiFeedbackFormState;
}) {
  const options = state.rating ? aiFeedbackReasonOptions[state.rating] : [];
  return (
    <section className="ai-feedback-control" aria-label={`${artifactLabel} AI quality feedback`}>
      <div className="ai-feedback-heading">
        <strong>Was this {artifactLabel} useful?</strong>
        <div className="ai-feedback-rating">
          <button
            aria-label={`Mark ${artifactLabel} helpful`}
            aria-pressed={state.rating === "helpful"}
            className={state.rating === "helpful" ? "icon-button active helpful" : "icon-button"}
            disabled={disabled || state.loading || state.saving}
            onClick={() => onRatingChange("helpful")}
            title="Helpful"
            type="button"
          >
            <ThumbsUp aria-hidden="true" size={16} />
          </button>
          <button
            aria-label={`Mark ${artifactLabel} not helpful`}
            aria-pressed={state.rating === "not_helpful"}
            className={
              state.rating === "not_helpful" ? "icon-button active not-helpful" : "icon-button"
            }
            disabled={disabled || state.loading || state.saving}
            onClick={() => onRatingChange("not_helpful")}
            title="Not helpful"
            type="button"
          >
            <ThumbsDown aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
      {state.rating ? (
        <div className="ai-feedback-details">
          <select
            aria-label={`${artifactLabel} feedback reason`}
            disabled={disabled || state.saving}
            onChange={(event) => onReasonChange(event.target.value)}
            value={state.reason}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            aria-label={`${artifactLabel} feedback detail`}
            disabled={disabled || state.saving}
            maxLength={500}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="Optional detail"
            value={state.comment}
          />
          <button
            className="secondary-button compact"
            disabled={disabled || !state.reason || state.saving}
            onClick={onSubmit}
            type="button"
          >
            {state.saving ? (
              <LoaderCircle aria-hidden="true" className="spin" size={14} />
            ) : (
              <Save aria-hidden="true" size={14} />
            )}
            Save feedback
          </button>
        </div>
      ) : null}
      {state.loading ? <small>Loading feedback...</small> : null}
      {state.saved ? <small className="success">Feedback saved for this version.</small> : null}
      {state.stale ? <small>Output changed. Rate the current version.</small> : null}
      {state.error ? <small className="danger">{state.error}</small> : null}
    </section>
  );
}

function createDemoBrief(): Brief {
  return {
    channelRisk: "warn",
    confidenceScore: 0.82,
    evidenceCards: initialEvidence.map((item) => ({
      confidenceScore: item.confidenceScore,
      evidenceId: item.evidenceId,
      rankScore: item.rankScore,
      sourceType: item.sourceType,
      summary: item.summary,
    })),
    fitScore: 0.86,
    goal: "research collaboration",
    id: "brief_demo",
    outreachAngles: [
      {
        evidenceIds: ["evidence_repo"],
        label: "Evidence-backed relevance",
        rationale: "Ada's public repository overlaps with trustworthy automation research.",
      },
    ],
    recommendedChannel: "email",
    summary:
      "Ada Lovelace is a strong research collaboration prospect based on repository and publication evidence. Consent is not confirmed, so outreach should remain human-reviewed.",
    warnings: ["Email consent is unknown; review before outreach."],
  };
}

function createDemoDraft(variant: Draft["variant"] = "warm_professional"): Draft {
  return {
    body:
      variant === "concise"
        ? "Hi Ada, I noticed your analytical-engine work and thought it may overlap with trustworthy automation research. Would a short conversation make sense?"
        : "Hi Ada, I came across your analytical-engine work and a related research signal around trustworthy automation. I am exploring research collaboration opportunities and thought there may be a useful overlap. Would you be open to comparing notes?",
    channelType: "email",
    createdAt: "2026-07-05T09:00:00.000Z",
    evidenceClaims: [
      {
        evidenceIds: ["evidence_repo"],
        text: "Ada's analytical-engine work overlaps with trustworthy automation.",
      },
    ],
    id: "draft_demo",
    status: "needs_review",
    tone: "warm professional",
    validationResult: {
      compliance: {
        decision: "warn",
        reason: "Email consent is unknown",
        reviewRequired: true,
        warnings: ["Human review required before outreach."],
      },
      unsupportedClaims: [],
      warnings: ["Human review required before outreach."],
    },
    updatedAt: "2026-07-05T09:00:00.000Z",
    variant,
  };
}

function createEmptyAiFeedbackState(): AiFeedbackFormState {
  return {
    comment: "",
    error: null,
    loading: false,
    rating: null,
    reason: "",
    saved: false,
    saving: false,
    stale: false,
  };
}

function toAiFeedbackFormState(response: AiFeedbackResponse): AiFeedbackFormState {
  return {
    comment: response.current?.comment ?? "",
    error: null,
    loading: false,
    rating: response.current?.rating ?? null,
    reason: response.current?.reason ?? "",
    saved: Boolean(response.current),
    saving: false,
    stale: response.stale,
  };
}

function toNoteTimelineItem(note: RelationshipNoteApi): NoteTimelineItem {
  return {
    authorId: note.author.id,
    authorName: note.author.displayName ?? note.author.email,
    body: note.body,
    createdAt: note.createdAt,
    eventType: "relationship_note.created",
    id: note.id,
    subjectType: "note",
    updatedAt: note.updatedAt,
  };
}

function RelationshipActivityIcon({ type }: { type: RelationshipActivityType }): ReactNode {
  if (type === "evidence") return <BookOpenText aria-hidden="true" size={14} />;
  if (type === "note") return <MessageSquareText aria-hidden="true" size={14} />;
  if (type === "brief") return <Sparkles aria-hidden="true" size={14} />;
  if (type === "draft") return <FileCheck2 aria-hidden="true" size={14} />;
  if (type === "policy") return <ShieldCheck aria-hidden="true" size={14} />;
  return <Check aria-hidden="true" size={14} />;
}

async function readApiError(response: Response, fallback = "Request failed."): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(" ");
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

function formatRetentionDate(value?: null | string): string {
  if (!value) return "Not scheduled";
  return formatActivityDate(value);
}

function formatActivityDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: date.getUTCFullYear() === new Date().getUTCFullYear() ? undefined : "numeric",
  }).format(date);
}

function formatOutcomeTitle(kind: RelationshipOutcomeKind): string {
  return kind
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return `${date.getUTCHours().toString().padStart(2, "0")}:${date
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
}
function formatDraftStatus(value?: Draft["status"]): string {
  if (!value) {
    return "none";
  }

  return value === "needs_review" ? "review" : value.replace("_", " ");
}
function describeDraftCompliance(draft: Draft): string {
  const compliance = draft.validationResult.compliance;
  if (!compliance) {
    return draft.status;
  }

  return `${compliance.decision}: ${compliance.reason}`;
}

function toComplianceDecision(draft: Draft): ComplianceDecisionState {
  const compliance = draft.validationResult.compliance;
  if (!compliance) {
    return {
      decision: draft.status === "blocked" ? "blocked" : "warn",
      reason: draft.status,
      warnings: draft.validationResult.warnings ?? [],
    };
  }

  return {
    decision: compliance.decision,
    reason: compliance.reason,
    warnings: compliance.warnings,
  };
}
function formatScore(value?: number | null): string {
  if (typeof value !== "number") {
    return "none";
  }

  return `${Math.round(value * 100)}%`;
}
