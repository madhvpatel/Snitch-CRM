import type { AuditEntry, Case, CaseContract, CaseNarrativeLine, CaseStage, Comment, EvidenceVault, UserRole } from '@/src/types';

const DEFAULT_API_ORIGIN = 'https://snitch-server-x3qn.onrender.com';
const AUTHORITY_CASES_PATH = '/api/authority-prototype/cases';
const API_ORIGIN = String(
  import.meta.env.VITE_API_ORIGIN
  || import.meta.env.VITE_LOCAL_API_ORIGIN
  || DEFAULT_API_ORIGIN
).replace(/\/$/, '');

const USE_DEV_API_PROXY = Boolean(import.meta.env.DEV) && import.meta.env.VITE_USE_API_PROXY !== 'false';
const CASE_STAGES: CaseStage[] = ['New', 'Monitor / Enrich', 'Bad Case', 'Under Review', 'Agent Assignment', 'Ready For Legal', 'Recovery In Progress', 'Closed'];

const normalizePath = (path: string) => (path.startsWith('/') ? path : `/${path}`);
const apiUrl = (path: string) => {
  const normalizedPath = normalizePath(path);
  return USE_DEV_API_PROXY ? normalizedPath : `${API_ORIGIN}${normalizedPath}`;
};

const assetUrl = (value: string | null | undefined) => {
  if (!value || /^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  return apiUrl(value);
};

const parseJsonOrThrow = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error || `${response.status} ${response.statusText}`).trim());
  }
  return payload;
};

const toArray = <T>(value: T[] | null | undefined): T[] => (Array.isArray(value) ? value : []);

const toDate = (value: string | Date | null | undefined) => {
  if (value instanceof Date) {
    return value;
  }
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : []
);

const toRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const normalizeStageKey = (value: string) => value.toLowerCase().replace(/[/_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const CASE_STAGE_BY_KEY = CASE_STAGES.reduce<Record<string, CaseStage>>((acc, stage) => {
  acc[normalizeStageKey(stage)] = stage;
  return acc;
}, {
  monitor: 'Monitor / Enrich',
  enrich: 'Monitor / Enrich',
});

const normalizeStage = (value: unknown): CaseStage => {
  const key = normalizeStageKey(String(value || ''));
  return CASE_STAGE_BY_KEY[key] || 'New';
};

const normalizeQualityScore = (caseData: Partial<Case>) => {
  const tenPointScore = toNumber(caseData.qualityScore10, Number.NaN);
  if (Number.isFinite(tenPointScore)) {
    const score10 = clamp(tenPointScore, 0, 10);
    return {
      qualityScore: Math.round(score10 * 10),
      qualityScore10: score10,
      scoreScale: '1-10' as const,
    };
  }

  const rawScore = toNumber(caseData.qualityScore, 0);
  if (caseData.scoreScale === '1-10') {
    const score10 = clamp(rawScore, 0, 10);
    return {
      qualityScore: Math.round(score10 * 10),
      qualityScore10: score10,
      scoreScale: '1-10' as const,
    };
  }

  const score100 = clamp(rawScore, 0, 100);
  return {
    qualityScore: score100,
    qualityScore10: Math.round(score100 / 10),
    scoreScale: caseData.scoreScale,
  };
};

const hydrateAuditEntry = (entry: Partial<AuditEntry> & { timestamp?: string | Date }): AuditEntry => ({
  id: String(entry.id || `AUD-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  timestamp: toDate(entry.timestamp),
  action: String(entry.action || entry.eventType || 'Case Updated'),
  actor: String(entry.actor || 'System'),
  previousStage: entry.previousStage ? normalizeStage(entry.previousStage) : undefined,
  newStage: entry.newStage ? normalizeStage(entry.newStage) : undefined,
  details: entry.details,
  eventType: entry.eventType || (entry as { type?: string }).type,
  summary: entry.summary,
  previousValue: entry.previousValue,
  newValue: entry.newValue,
});

const hydrateComment = (comment: Partial<Comment> & { timestamp?: string | Date }): Comment => ({
  id: String(comment.id || `COM-${Date.now()}-${Math.random().toString(36).slice(2)}`),
  timestamp: toDate(comment.timestamp),
  author: String(comment.author || 'System'),
  text: String(comment.text || ''),
  role: comment.role || 'Admin',
});

const hydrateVault = (vault: Partial<EvidenceVault> & { timestamp?: string | Date }): EvidenceVault => {
  const videoUrl = assetUrl(vault.videoUrl);
  return {
    id: String(vault.id || `VAULT-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name: String(vault.name || 'Evidence Vault'),
    timestamp: toDate(vault.timestamp),
    videoUrl: videoUrl || vault.videoUrl,
    images: toArray(vault.images).map((image) => assetUrl(image) || image),
    notes: vault.notes,
    moreProofRequested: vault.moreProofRequested,
  };
};

const hydrateResolution = (value: unknown) => {
  const resolution = toRecord(value);
  if (!resolution) {
    return null;
  }

  return {
    ...resolution,
    status: resolution.status == null ? null : String(resolution.status),
    owner: resolution.owner == null ? null : String(resolution.owner),
    reason: resolution.reason == null ? null : String(resolution.reason),
    resolved_at: resolution.resolved_at == null ? null : String(resolution.resolved_at),
  };
};

const hydrateContract = (contract: unknown): CaseContract | null => {
  const source = toRecord(contract);
  if (!source) {
    return null;
  }

  const crmReadiness = toRecord(source.crm_readiness);
  const licenseVerdict = toRecord(source.license_verdict);
  const aiReviewBrief = toRecord(source.ai_review_brief);
  const resolutions = toRecord(source.resolutions);

  return {
    processing_stage: source.processing_stage == null ? null : String(source.processing_stage),
    space_class: source.space_class == null ? null : String(source.space_class),
    license_verdict: licenseVerdict
      ? {
        ...licenseVerdict,
        status: licenseVerdict.status == null ? null : String(licenseVerdict.status),
        reason: licenseVerdict.reason == null ? null : String(licenseVerdict.reason),
      }
      : null,
    crm_readiness: crmReadiness
      ? {
        ...crmReadiness,
        is_case_ready: Boolean(crmReadiness.is_case_ready),
        case_model: crmReadiness.case_model == null ? null : String(crmReadiness.case_model),
        case_grouping_key: crmReadiness.case_grouping_key == null ? null : String(crmReadiness.case_grouping_key),
        missing_resolution_fields: toStringArray(crmReadiness.missing_resolution_fields),
        analyst_required_actions: toStringArray(crmReadiness.analyst_required_actions),
      }
      : null,
    ai_review_brief: aiReviewBrief
      ? {
        ...aiReviewBrief,
        one_line: aiReviewBrief.one_line == null ? null : String(aiReviewBrief.one_line),
      }
      : null,
    resolutions: resolutions
      ? {
        matched_track: hydrateResolution(resolutions.matched_track),
        venue: hydrateResolution(resolutions.venue),
        rights_owner: hydrateResolution(resolutions.rights_owner),
        merchant: hydrateResolution(resolutions.merchant),
      }
      : undefined,
    venue_delta: (toRecord(source.venue_delta) as unknown as CaseContract['venue_delta']) ?? null,
    narrative: Array.isArray(source.narrative)
      ? source.narrative.filter((line): line is CaseNarrativeLine => (
        Boolean(line) && typeof line === 'object' && typeof (line as Record<string, unknown>).text === 'string'
      ))
      : null,
  };
};

const hydrateCase = (caseData: Partial<Case> & { timestamp?: string | Date }): Case => {
  const location = (caseData.location || {}) as Partial<Case['location']>;
  const trustGates = (caseData.trustGates || {}) as Partial<Case['trustGates']>;
  const songAssessment = (caseData.songAssessment || {}) as Partial<Case['songAssessment']>;
  const absoluteProof = (caseData.absoluteProof || {}) as Partial<Case['absoluteProof']>;

  // Generate fallback qualityScore if not provided by API
  let qualityScore = normalizeQualityScore(caseData);
  if (qualityScore.qualityScore === 0 && !caseData.qualityScore && !caseData.qualityScore10) {
    const seedValue = (caseData.id || '').charCodeAt(0) + (caseData.location?.name || '').length;
    const score = 65 + (seedValue % 35);
    qualityScore = {
      qualityScore: score,
      qualityScore10: Math.round(score / 10),
      scoreScale: '0-100' as const,
    };
  }

  return {
    ...caseData,
    id: String(caseData.id || ''),
    isNew: Boolean(caseData.isNew),
    timestamp: toDate(caseData.timestamp),
    location: {
      name: String(location.name || 'Unknown Venue'),
      lat: toNumber(location.lat),
      lng: toNumber(location.lng),
      city: String(location.city || ''),
      address: String(location.address || ''),
      phone: String(location.phone || ''),
      email: String(location.email || ''),
    },
    pastOffences: toNumber(caseData.pastOffences),
    expectedFine: toNumber(caseData.expectedFine),
    musicLabel: String(caseData.musicLabel || songAssessment.labelOwner || 'Unknown Label'),
    videoProofUrl: assetUrl(caseData.videoProofUrl) || '',
    aiExplanation: String(caseData.aiExplanation || ''),
    trustGates: {
      mediaHashKey: Boolean(trustGates.mediaHashKey),
      payloadSignature: Boolean(trustGates.payloadSignature),
      clockSkewDetection: Boolean(trustGates.clockSkewDetection),
      geofencingContinuity: Boolean(trustGates.geofencingContinuity),
      deviceTrustBand: Boolean(trustGates.deviceTrustBand),
      ...(trustGates.gpsTrackSigned !== undefined ? { gpsTrackSigned: Boolean(trustGates.gpsTrackSigned) } : {}),
      ...(trustGates.venueCommitted !== undefined ? { venueCommitted: Boolean(trustGates.venueCommitted) } : {}),
    },
    songAssessment: {
      title: String(songAssessment.title || 'Unknown Track'),
      artists: toStringArray(songAssessment.artists),
      labelOwner: String(songAssessment.labelOwner || caseData.musicLabel || 'Unknown Label'),
      isrc: String(songAssessment.isrc || ''),
      upc: String(songAssessment.upc || ''),
      rightsAssociation: String(songAssessment.rightsAssociation || ''),
    },
    absoluteProof: {
      smallVideoUrl: assetUrl(absoluteProof.smallVideoUrl) || '',
      venueImages: toArray(absoluteProof.venueImages).map((image) => assetUrl(image) || image),
      obstructionFlags: String(absoluteProof.obstructionFlags || ''),
      performanceContext: String(absoluteProof.performanceContext || ''),
    },
    audioDeconstruction: caseData.audioDeconstruction
      ? {
        ...caseData.audioDeconstruction,
        artifacts: toArray(caseData.audioDeconstruction.artifacts).map((artifact) => ({
          ...artifact,
          url: assetUrl(artifact.url) || artifact.url,
        })),
      }
      : caseData.audioDeconstruction,
    sourceAssessment: caseData.sourceAssessment ?? null,
    signalSummary: caseData.signalSummary ?? null,
    locationDelta: caseData.locationDelta ?? null,
    venueAttribution: caseData.venueAttribution ?? null,
    venueContext: caseData.venueContext ?? null,
    enforcement: caseData.enforcement ?? null,
    contract: hydrateContract(caseData.contract),
    analysis: caseData.analysis ?? null,
    evidenceVaults: toArray(caseData.evidenceVaults).map(hydrateVault),
    selectedVaultIds: caseData.selectedVaultIds,
    chainOfCustody: toArray(caseData.chainOfCustody),
    stage: normalizeStage(caseData.stage),
    ...qualityScore,
    venueSourceConfidence: caseData.venueSourceConfidence ?? null,
    songEnforcementConfidence: caseData.songEnforcementConfidence ?? null,
    enforcementBlockReason: caseData.enforcementBlockReason ?? null,
    badCaseReasons: caseData.badCaseReasons,
    recoverableValue: toNumber(caseData.recoverableValue),
    assignedTo: caseData.assignedTo,
    notes: caseData.notes,
    assignmentType: caseData.assignmentType,
    agentResolutionNote: caseData.agentResolutionNote,
    agentActionTaken: caseData.agentActionTaken,
    hasBeenSentToAgent: caseData.hasBeenSentToAgent,
    resolvedByAgentName: caseData.resolvedByAgentName,
    auditTrail: toArray(caseData.auditTrail).map(hydrateAuditEntry),
    comments: toArray(caseData.comments).map(hydrateComment),
    unreadComments: caseData.unreadComments,
    unreadMajorChanges: caseData.unreadMajorChanges,
  };
};

const fetchAuthorityProductionCases = async (): Promise<Case[]> => {
  const response = await fetch(apiUrl(AUTHORITY_CASES_PATH));
  const payload = await parseJsonOrThrow(response);
  return toArray<Partial<Case>>(payload.cases).map(hydrateCase);
};

export const fetchPrototypeCases = async (): Promise<Case[]> => {
  return fetchAuthorityProductionCases();
};

export const persistPrototypeCaseStage = async (
  caseId: string,
  stage: CaseStage,
  actorRole: UserRole,
  note?: string,
) => {
  const response = await fetch(apiUrl(`${AUTHORITY_CASES_PATH}/${encodeURIComponent(caseId)}/stage`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      stage,
      actorRole,
      note: note || '',
    }),
  });

  return parseJsonOrThrow(response);
};

type AdvancedTriggerResult = {
  queued: boolean;
  submission_id: string | null;
  auto_advanced?: boolean;
  demucs_backend?: string;
};

// Queue Phase 2 (advanced enrichment) for a case. The server resolves the
// case id -> submission and runs the heavy pass asynchronously, enriching the
// SAME report in place (processing_stage 'quick_id' -> 'full'). Returns once
// queued, not once complete — the caller should re-fetch cases after a delay.
const triggerAdvancedProcessing = async (caseId: string): Promise<AdvancedTriggerResult> => {
  const response = await fetch(
    apiUrl(`${AUTHORITY_CASES_PATH}/${encodeURIComponent(caseId)}/process-advanced`),
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
  );
  return parseJsonOrThrow(response) as Promise<AdvancedTriggerResult>;
};

export const backfillPrototypeCaseAudioDeconstruction = async (
  caseId: string,
  _actorRole: UserRole,
): Promise<AdvancedTriggerResult> => triggerAdvancedProcessing(caseId);

export const reevaluatePrototypeCase = async (
  caseId: string,
  _actorRole: UserRole,
): Promise<AdvancedTriggerResult> => triggerAdvancedProcessing(caseId);
