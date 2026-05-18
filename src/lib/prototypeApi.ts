import type { AuditEntry, Case, CaseStage, Comment, EvidenceVault, UserRole } from '@/src/types';

const DEFAULT_API_ORIGIN = 'https://snitch-server-x3qn.onrender.com';
const API_ORIGIN = String(import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ORIGIN).replace(/\/$/, '');

const apiUrl = (path: string) => `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;

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

const hydrateAuditEntry = (entry: AuditEntry & { timestamp: string | Date }): AuditEntry => ({
  ...entry,
  timestamp: toDate(entry.timestamp),
});

const hydrateComment = (comment: Comment & { timestamp: string | Date }): Comment => ({
  ...comment,
  timestamp: toDate(comment.timestamp),
});

const hydrateVault = (vault: EvidenceVault & { timestamp: string | Date }): EvidenceVault => {
  const videoUrl = assetUrl(vault.videoUrl);
  return {
    ...vault,
    timestamp: toDate(vault.timestamp),
    videoUrl: videoUrl || vault.videoUrl,
    images: (vault.images || []).map((image) => assetUrl(image) || image),
  };
};

const hydrateCase = (caseData: Omit<Case, 'timestamp' | 'auditTrail' | 'comments' | 'evidenceVaults'> & {
  timestamp: string | Date;
  auditTrail: Array<AuditEntry & { timestamp: string | Date }>;
  comments: Array<Comment & { timestamp: string | Date }>;
  evidenceVaults: Array<EvidenceVault & { timestamp: string | Date }>;
}): Case => ({
  ...caseData,
  timestamp: toDate(caseData.timestamp),
  videoProofUrl: assetUrl(caseData.videoProofUrl) || caseData.videoProofUrl,
  auditTrail: (caseData.auditTrail || []).map(hydrateAuditEntry),
  comments: (caseData.comments || []).map(hydrateComment),
  evidenceVaults: (caseData.evidenceVaults || []).map(hydrateVault),
  audioDeconstruction: caseData.audioDeconstruction
    ? {
      ...caseData.audioDeconstruction,
      artifacts: (caseData.audioDeconstruction.artifacts || []).map((artifact) => ({
        ...artifact,
        url: assetUrl(artifact.url) || artifact.url,
      })),
    }
    : caseData.audioDeconstruction,
});

export const fetchPrototypeCases = async (): Promise<Case[]> => {
  const response = await fetch(apiUrl('/api/authority-prototype/cases'));
  const payload = await parseJsonOrThrow(response);
  return (payload.cases || []).map(hydrateCase);
};

export const persistPrototypeCaseStage = async (
  caseId: string,
  stage: CaseStage,
  actorRole: UserRole,
  note?: string,
) => {
  const response = await fetch(apiUrl(`/api/authority-prototype/cases/${encodeURIComponent(caseId)}/stage`), {
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

export const backfillPrototypeCaseAudioDeconstruction = async (
  caseId: string,
  actorRole: UserRole,
): Promise<{ ok: boolean; preservedExisting: boolean; error: string | null; case: Case | null }> => {
  const response = await fetch(apiUrl(`/api/authority-prototype/cases/${encodeURIComponent(caseId)}/audio-deconstruction`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      actorRole,
    }),
  });

  const payload = await parseJsonOrThrow(response);
  return {
    ok: Boolean(payload?.ok),
    preservedExisting: Boolean(payload?.preservedExisting),
    error: payload?.error ? String(payload.error) : null,
    case: payload?.case ? hydrateCase(payload.case) : null,
  };
};

export const reevaluatePrototypeCase = async (
  caseId: string,
  actorRole: UserRole,
): Promise<{ ok: boolean; status: string | null; case: Case | null }> => {
  const response = await fetch(apiUrl(`/api/authority-prototype/cases/${encodeURIComponent(caseId)}/re-evaluate`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      actorRole,
    }),
  });

  const payload = await parseJsonOrThrow(response);
  return {
    ok: Boolean(payload?.ok),
    status: payload?.status ? String(payload.status) : null,
    case: payload?.case ? hydrateCase(payload.case) : null,
  };
};
