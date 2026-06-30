export type CaseStage = 'New' | 'Monitor / Enrich' | 'Bad Case' | 'Under Review' | 'Agent Assignment' | 'Ready For Legal' | 'Recovery In Progress' | 'Closed';

export type UserRole = 'Admin' | 'Lawyer' | 'Agent';

export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  previousStage?: CaseStage;
  newStage?: CaseStage;
  details?: string;
  eventType?: string;
  summary?: string;
  previousValue?: string;
  newValue?: string;
}

export interface Comment {
  id: string;
  timestamp: Date;
  author: string;
  text: string;
  role: UserRole;
}

export interface ChainOfCustodyEntry {
  timestamp: string;
  event: string;
  actor: string;
  hash: string;
  deviceId: string;
  status: 'Verified' | 'Pending' | 'Failed';
}

export interface EvidenceVault {
  id: string;
  name: string;
  timestamp: Date;
  videoUrl?: string;
  images: string[];
  notes?: string;
  moreProofRequested?: boolean;
}

export interface AudioDeconstructionArtifact {
  stem: string;
  assetId: string;
  mimeType: string;
  sizeBytes?: number;
  url: string;
}

export interface AudioDeconstruction {
  status: 'completed' | 'failed' | 'skipped' | 'unknown';
  provider: string;
  model?: string | null;
  device?: string | null;
  jobId?: string | null;
  preferredStem?: string | null;
  peakSelectionStem?: string | null;
  fingerprintStem?: string | null;
  usedForPeakSelection?: boolean;
  usedForFingerprinting?: boolean;
  summary?: string;
  error?: string | null;
  artifacts: AudioDeconstructionArtifact[];
}

export interface SourceAssessment {
  sourceClass?: 'likely_pa_system' | 'likely_small_speaker' | 'likely_personal_device' | 'inconclusive' | string | null;
  score?: number | null;
  confidence?: number | null;
  classifierMode?: string | null;
  requestedMode?: string | null;
  explanation?: string[] | string | null;
  analystNote?: string | null;
  signals?: Record<string, unknown> | null;
}

export interface SignalSummary {
  sourceClass?: string | null;
  sourceScore?: number | null;
  sourceConfidence?: number | null;
  classifierMode?: string | null;
}

export interface LocationDelta {
  selectedVenueDistanceStartMeters?: number | null;
  selectedVenueDistanceEndMeters?: number | null;
  matchedVenueDistanceStartMeters?: number | null;
  matchedVenueDistanceEndMeters?: number | null;
  minVenueDistanceMeters?: number | null;
  maxVenueDistanceMeters?: number | null;
  avgVenueDistanceMeters?: number | null;
  venueAnchorDeltaMeters?: number | null;
  capturePathDeltaMeters?: number | null;
  accuracyStartMeters?: number | null;
  accuracyEndMeters?: number | null;
  averageAccuracyMeters?: number | null;
  accuracyEnvelopeMeters?: number | null;
  withinAccuracyEnvelope?: boolean | null;
  selectedMatchedAligned?: boolean | null;
  geoBucket?: string | null;
  primaryVenueSource?: string | null;
}

export interface VenueAttribution {
  status: string;
  actualSource?: string | null;
  targetVenue?: string | null;
  matchedVenue?: string | null;
  visualSource?: string | null;
  selectedVenueDistanceStartMeters?: number | null;
  selectedVenueDistanceEndMeters?: number | null;
  matchedVenueDistanceStartMeters?: number | null;
  matchedVenueDistanceEndMeters?: number | null;
  minVenueDistanceMeters?: number | null;
  venueAnchorDeltaMeters?: number | null;
  accuracyEnvelopeMeters?: number | null;
  withinAccuracyEnvelope?: boolean | null;
  selectedMatchedAligned?: boolean | null;
  score?: number | null;
  unitAmbiguityRisk?: string | null;
  adjacentCaptureRisk?: string | null;
  legalBlock?: boolean;
  recommendedDisposition?: string | null;
  note?: string | null;
}

export interface VenueContext {
  selectedVenue?: {
    id?: string;
    name?: string;
    address?: string;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
    placeProviderId?: string | null;
    placeProvider?: string | null;
  } | null;
  matchedVenue?: {
    id?: string;
    name?: string;
    address?: string;
    city?: string;
    latitude?: number | null;
    longitude?: number | null;
    placeProviderId?: string | null;
    placeProvider?: string | null;
  } | null;
}

export type ReadinessBand =
  | 'INSUFFICIENT_EVIDENCE'
  | 'MONITOR_ENRICH'
  | 'CASE_CANDIDATE'
  | 'ESCALATION_READY'
  | 'LITIGATION_READY';

export type LicenseStatus =
  | 'UNKNOWN'
  | 'MANUAL_REVIEW_REQUIRED'
  | 'UNLICENSED'
  | 'LICENSED'
  | 'EXEMPT'
  | 'NOT_REQUIRED';

export type VenueIdentityStatus = 'RESOLVED' | 'APPROXIMATE' | 'UNRESOLVED';

export interface ReadinessReason {
  code: string;
  displayText: string;
  severity?: 'blocking' | 'warning' | 'info';
}

export interface ReadinessAction {
  code: string;
  displayText: string;
}

export interface ReadinessState {
  score: number;
  band: ReadinessBand;
  bandDisplayLabel: string;
  reasons: ReadinessReason[];
  nextActions: ReadinessAction[];
}

export interface LitigationEligibilityState {
  canSendToLitigation: boolean;
  blockingReasons: ReadinessReason[];
  checkedAt?: string;
}

export interface LicenseGateState {
  status: LicenseStatus;
  source?: string;
  checkedAt?: string;
  checkedBy?: string;
  manualAttestationStatus?: 'NOT_ATTESTED' | 'ATTESTED' | 'REJECTED';
  registryLookupReference?: string;
  resolutionWorkflowUrl?: string;
}

export interface ProsecutionStrengthState {
  score: number;
  label: string;
  reasons: ReadinessReason[];
  incidentPattern: 'single_incident' | 'repeat_pattern';
}

export interface IncidentTimelineEntry {
  id: string;
  capturedAt: string;
  detectedSong: string;
  evidenceConfidence: number;
  hasForensicArtifacts: boolean;
  status: string;
  sourceLocation: string;
}

export interface RepeatCaptureSummary {
  confirmedIncidentCount: number;
  distinctCaptureDates: number;
  distinctDetectedSongs: number;
  firstDetectedAt?: string;
  latestDetectedAt?: string;
}

export interface VenueIdentityState {
  status: VenueIdentityStatus;
  displayLabel: string;
  coordinates?: { lat: number; lng: number };
  candidateVenueCount?: number;
  bestCandidateConfidence?: number;
  assignmentStatus?: string;
  followUpStatus?: string;
}

export interface EnforcementWorkflowState {
  readiness?: ReadinessState;
  litigationEligibility?: LitigationEligibilityState;
  licenseGate?: LicenseGateState;
  prosecutionStrength?: ProsecutionStrengthState;
  incidentTimeline?: IncidentTimelineEntry[];
  repeatCaptureSummary?: RepeatCaptureSummary;
  venueIdentity?: VenueIdentityState;
}

export interface CaseResolutionState {
  status?: 'resolved' | 'unresolved' | 'pending_analyst_review' | string | null;
  owner?: 'pipeline' | 'analyst' | string | null;
  reason?: string | null;
  resolved_value?: unknown;
  resolved_at?: string | null;
  [key: string]: unknown;
}

export interface CaseLicenseVerdict {
  status?: string | null;
  reason?: string | null;
  [key: string]: unknown;
}

export interface CaseCrmReadiness {
  is_case_ready?: boolean;
  case_model?: string | null;
  case_grouping_key?: string | null;
  missing_resolution_fields?: string[];
  analyst_required_actions?: string[];
  [key: string]: unknown;
}

export interface CaseReviewBrief {
  one_line?: string | null;
  [key: string]: unknown;
}

// One line of the deterministic, templated case story (see server's
// buildCaseNarrative — every line reads a real structured field, never an
// LLM call, so it can't drift from the underlying facts).
export interface CaseNarrativeLine {
  id: string;
  tone: 'green' | 'amber' | 'red' | 'grey';
  label: string;
  text: string;
  blockers?: string[];
}

export interface CaseVenueDelta {
  flagged: boolean;
  userSelectedVenue?: string | null;
  systemRecommendedVenue?: string | null;
  severity?: string | null;
  basis?: string | null;
  note?: string | null;
}

export interface CaseContract {
  processing_stage?: string | null;
  space_class?: string | null;
  license_verdict?: CaseLicenseVerdict | null;
  crm_readiness?: CaseCrmReadiness | null;
  ai_review_brief?: CaseReviewBrief | null;
  venue_delta?: CaseVenueDelta | null;
  narrative?: CaseNarrativeLine[] | null;
  resolutions?: {
    matched_track?: CaseResolutionState | null;
    venue?: CaseResolutionState | null;
    rights_owner?: CaseResolutionState | null;
    merchant?: CaseResolutionState | null;
    [key: string]: CaseResolutionState | null | undefined;
  };
}

// Full raw Phase 2 analysis. Loosely typed on purpose — the server emits the
// complete pipeline output (forensic summary, source/visual/application
// analysis, signage OCR + peak windows nested in visual_analysis, venue
// resolution review, declared-vs-detected reconciliation). Structure these into
// dedicated typed shapes as the frontend renders each one.
export interface CaseAnalysis {
  processing_stage?: string | null;
  forensic_summary?: unknown;
  source_analysis?: unknown;
  visual_analysis?: unknown;
  application_assessment?: unknown;
  venue_resolution_review?: unknown;
  context_reconciliation?: unknown;
  ai_review_brief?: CaseReviewBrief | null;
  license_verdict?: CaseLicenseVerdict | null;
  space_class?: string | null;
  [key: string]: unknown;
}

export interface Case {
  id: string;
  isNew: boolean;
  timestamp: Date;
  location: {
    name: string;
    lat: number;
    lng: number;
    city: string;
    address: string;
    phone: string;
    email: string;
  };
  pastOffences: number;
  expectedFine: number;
  musicLabel: string;
  
  // Detail Page Data
  videoProofUrl: string;
  aiExplanation: string;
  
  trustGates: {
    mediaHashKey: boolean;
    payloadSignature: boolean;
    clockSkewDetection: boolean;
    geofencingContinuity: boolean;
    deviceTrustBand: boolean;
    gpsTrackSigned?: boolean;
    venueCommitted?: boolean;
  };
  
  songAssessment: {
    title: string;
    artists: string[];
    labelOwner: string;
    isrc: string;
    upc: string;
    rightsAssociation: string;
  };
  
  absoluteProof: {
    smallVideoUrl: string;
    venueImages: string[];
    obstructionFlags: string;
    performanceContext: string;
  };

  audioDeconstruction?: AudioDeconstruction | null;
  sourceAssessment?: SourceAssessment | null;
  signalSummary?: SignalSummary | null;
  locationDelta?: LocationDelta | null;
  venueAttribution?: VenueAttribution | null;
  venueContext?: VenueContext | null;
  enforcement?: EnforcementWorkflowState | null;
  contract?: CaseContract | null;
  // Full raw Phase 2 analysis passthrough from the server. Shapes are
  // intentionally loose for now — surface everything, structure it later as the
  // frontend is built out. Null until advanced processing has run.
  analysis?: CaseAnalysis | null;

  evidenceVaults: EvidenceVault[];
  selectedVaultIds?: string[];
  
  chainOfCustody: ChainOfCustodyEntry[];
  
  stage: CaseStage;
  qualityScore: number;
  qualityScore10?: number;
  scoreScale?: '1-10' | string;
  venueSourceConfidence?: number | null;
  songEnforcementConfidence?: number | null;
  enforcementBlockReason?: string | null;
  badCaseReasons?: string[];
  recoverableValue: number;
  
  // Assignment Data
  assignedTo?: string;
  notes?: string;
  assignmentType?: 'Agent' | 'Lawyer';
  agentResolutionNote?: string;
  agentActionTaken?: string;
  hasBeenSentToAgent?: boolean;
  resolvedByAgentName?: string;
  
  // Audit & Communication
  auditTrail: AuditEntry[];
  comments: Comment[];
  unreadComments?: boolean;
  unreadMajorChanges?: boolean;
}

export const MOCK_CASES: Case[] = [
  {
    id: "CASE-8821",
    isNew: true,
    timestamp: new Date(2024, 3, 5, 10, 30),
    location: { 
      name: "Blue Lagoon Restobar", 
      lat: 19.0760, 
      lng: 72.8777, 
      city: "Mumbai",
      address: "Plot No. 12, Juhu Tara Rd, Mumbai, Maharashtra 400049",
      phone: "+91 22 2611 1234",
      email: "contact@bluelagoon.in"
    },
    pastOffences: 3,
    expectedFine: 45000,
    musicLabel: "T-Series",
    videoProofUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-in-a-nightclub-4351-large.mp4",
    aiExplanation: "The video captures a high-decibel public performance of copyrighted material. Multiple speakers are visible, and the audio fingerprint matches 'Tum Hi Ho' with 98% confidence. No licensing certificate is displayed at the entrance or DJ booth.",
    trustGates: {
      mediaHashKey: true,
      payloadSignature: true,
      clockSkewDetection: true,
      geofencingContinuity: true,
      deviceTrustBand: true
    },
    songAssessment: {
      title: "Tum Hi Ho",
      artists: ["Arijit Singh"],
      labelOwner: "T-Series",
      isrc: "IN-T12-13-00001",
      upc: "8901234567890",
      rightsAssociation: "IPRS / PPL"
    },
    absoluteProof: {
      smallVideoUrl: "https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-club-4354-large.mp4",
      venueImages: [
        "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=400&h=300&fit=crop",
        "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=300&fit=crop"
      ],
      obstructionFlags: "Clear line of sight to the source. No significant visual noise detected.",
      performanceContext: "Peak hour Friday night, estimated attendance 250+."
    },
    evidenceVaults: [
      {
        id: "VAULT-1",
        name: "Evidence Vault 1",
        timestamp: new Date(2024, 3, 5, 10, 30),
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-in-a-nightclub-4351-large.mp4",
        images: [
          "https://images.unsplash.com/photo-1514525253361-bee8718a74a2?w=400&h=300&fit=crop",
          "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=300&fit=crop"
        ],
        notes: "Initial forensic capture at venue."
      }
    ],
    chainOfCustody: [
      { timestamp: "2024-04-05T10:30:12Z", event: "Initial Capture", actor: "Field Device #442", hash: "sha256:e3b0c442...", deviceId: "DEV-X99-01", status: "Verified" },
      { timestamp: "2024-04-05T10:31:45Z", event: "Server Ingestion", actor: "Ingest-Node-04", hash: "sha256:e3b0c442...", deviceId: "SRV-IN-04", status: "Verified" },
      { timestamp: "2024-04-05T10:32:10Z", event: "AI Fingerprint Match", actor: "GenAI-Engine-V3", hash: "match_conf:0.982", deviceId: "AI-PROC-01", status: "Verified" }
    ],
    stage: "New",
    qualityScore: 94,
    recoverableValue: 125000,
    auditTrail: [
      { id: "AUD-1", timestamp: new Date(2024, 3, 5, 10, 30), action: "Case Created", actor: "System", newStage: "New" }
    ],
    comments: [],
    unreadMajorChanges: true
  },
  {
    id: "CASE-8822",
    isNew: false,
    timestamp: new Date(2024, 3, 5, 0, 15),
    location: { 
      name: "Skyline Rooftop", 
      lat: 12.9716, 
      lng: 77.5946, 
      city: "Bangalore",
      address: "24th Floor, UB City, Vittal Mallya Rd, Bengaluru, Karnataka 560001",
      phone: "+91 80 4112 5678",
      email: "info@skylinerooftop.com"
    },
    pastOffences: 0,
    expectedFine: 15000,
    musicLabel: "Zee Music Co.",
    videoProofUrl: "https://assets.mixkit.co/videos/preview/mixkit-crowd-at-a-concert-with-lights-4353-large.mp4",
    aiExplanation: "Audio detection indicates 'Zingaat' playing during a private corporate event. However, the venue claims a one-time event license which is currently being verified against the database.",
    trustGates: {
      mediaHashKey: true,
      payloadSignature: true,
      clockSkewDetection: false,
      geofencingContinuity: true,
      deviceTrustBand: true
    },
    songAssessment: {
      title: "Zingaat",
      artists: ["Ajay-Atul"],
      labelOwner: "Zee Music Co.",
      isrc: "IN-Z13-16-00452",
      upc: "8909876543210",
      rightsAssociation: "IPRS"
    },
    absoluteProof: {
      smallVideoUrl: "https://assets.mixkit.co/videos/preview/mixkit-concert-crowd-with-raised-hands-4355-large.mp4",
      venueImages: [
        "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=300&fit=crop"
      ],
      obstructionFlags: "Partial obstruction by stage lighting. Audio remains clear.",
      performanceContext: "Corporate mixer, semi-private setting."
    },
    evidenceVaults: [
      {
        id: "VAULT-1",
        name: "Evidence Vault 1",
        timestamp: new Date(2024, 3, 5, 0, 15),
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-crowd-at-a-concert-with-lights-4353-large.mp4",
        images: [
          "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=400&h=300&fit=crop"
        ],
        notes: "Initial capture."
      }
    ],
    chainOfCustody: [
      { timestamp: "2024-04-05T00:15:05Z", event: "Initial Capture", actor: "Field Device #112", hash: "sha256:f4a1d223...", deviceId: "DEV-X11-02", status: "Verified" },
      { timestamp: "2024-04-05T00:16:30Z", event: "Clock Skew Check", actor: "Trust-Gate-B", hash: "skew_detected:1.2s", deviceId: "SRV-TR-02", status: "Pending" }
    ],
    stage: "New",
    qualityScore: 72,
    recoverableValue: 45000,
    auditTrail: [
      { id: "AUD-2", timestamp: new Date(2024, 3, 5, 0, 15), action: "Case Created", actor: "System", newStage: "New" }
    ],
    comments: []
  },
  {
    id: "CASE-8823",
    isNew: false,
    timestamp: new Date(2024, 3, 4, 22, 0),
    location: { 
      name: "The Local Pub", 
      lat: 28.6139, 
      lng: 77.2090, 
      city: "Delhi",
      address: "H-Block, Connaught Place, New Delhi, Delhi 110001",
      phone: "+91 11 2341 9876",
      email: "manager@thelocalpub.co.in"
    },
    pastOffences: 5,
    expectedFine: 85000,
    musicLabel: "Sony Music India",
    videoProofUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-at-a-party-4352-large.mp4",
    aiExplanation: "Repeat offender. Video shows continuous playback of Sony Music catalog. GPS coordinates match the venue exactly. High confidence in infringement.",
    trustGates: {
      mediaHashKey: true,
      payloadSignature: true,
      clockSkewDetection: true,
      geofencingContinuity: true,
      deviceTrustBand: true
    },
    songAssessment: {
      title: "Kesariya",
      artists: ["Arijit Singh"],
      labelOwner: "Sony Music India",
      isrc: "IN-S11-22-00991",
      upc: "8904561237890",
      rightsAssociation: "IPRS / PPL"
    },
    absoluteProof: {
      smallVideoUrl: "https://assets.mixkit.co/videos/preview/mixkit-party-crowd-dancing-with-confetti-4356-large.mp4",
      venueImages: [
        "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=400&h=300&fit=crop"
      ],
      obstructionFlags: "No obstructions. Clear view of the dance floor and DJ setup.",
      performanceContext: "Saturday night, full capacity."
    },
    evidenceVaults: [
      {
        id: "VAULT-1",
        name: "Evidence Vault 1",
        timestamp: new Date(2024, 3, 4, 22, 0),
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-at-a-party-4352-large.mp4",
        images: [
          "https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?w=400&h=300&fit=crop"
        ],
        notes: "Initial capture."
      }
    ],
    chainOfCustody: [
      { timestamp: "2024-04-04T22:00:01Z", event: "Initial Capture", actor: "Field Device #881", hash: "sha256:b2c1a334...", deviceId: "DEV-X88-05", status: "Verified" },
      { timestamp: "2024-04-04T22:01:20Z", event: "Server Ingestion", actor: "Ingest-Node-01", hash: "sha256:b2c1a334...", deviceId: "SRV-IN-01", status: "Verified" }
    ],
    stage: "New",
    qualityScore: 98,
    recoverableValue: 210000,
    auditTrail: [
      { id: "AUD-3", timestamp: new Date(2024, 3, 4, 22, 0), action: "Case Created", actor: "System", newStage: "New" }
    ],
    comments: [],
    unreadComments: true
  },
  {
    id: "CASE-8824",
    isNew: false,
    timestamp: new Date(),
    location: { 
      name: "Club Nirvana", 
      lat: 18.5204, 
      lng: 73.8567, 
      city: "Pune",
      address: "Main Rd, Koregaon Park, Pune, Maharashtra 411001",
      phone: "+91 20 2615 4321",
      email: "events@clubnirvana.com"
    },
    pastOffences: 1,
    expectedFine: 30000,
    musicLabel: "Sony Music India",
    videoProofUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-in-a-nightclub-4351-large.mp4",
    aiExplanation: "Real-time detection of Sony Music catalog. High volume playback confirmed.",
    trustGates: {
      mediaHashKey: true,
      payloadSignature: true,
      clockSkewDetection: true,
      geofencingContinuity: true,
      deviceTrustBand: true
    },
    songAssessment: {
      title: "Malhari",
      artists: ["Vishal Dadlani"],
      labelOwner: "Sony Music India",
      isrc: "IN-S11-15-00123",
      upc: "8904561230001",
      rightsAssociation: "IPRS"
    },
    absoluteProof: {
      smallVideoUrl: "https://assets.mixkit.co/videos/preview/mixkit-dj-playing-music-at-a-club-4354-large.mp4",
      venueImages: [],
      obstructionFlags: "None",
      performanceContext: "Live detection"
    },
    evidenceVaults: [
      {
        id: "VAULT-1",
        name: "Evidence Vault 1",
        timestamp: new Date(),
        videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-in-a-nightclub-4351-large.mp4",
        images: [],
        notes: "Live capture."
      }
    ],
    chainOfCustody: [
      { timestamp: new Date().toISOString(), event: "Live Capture", actor: "Field Device #990", hash: "sha256:live_hash...", deviceId: "DEV-LIVE-01", status: "Verified" }
    ],
    stage: "New",
    qualityScore: 88,
    recoverableValue: 95000,
    auditTrail: [
      { id: "AUD-4", timestamp: new Date(), action: "Case Created", actor: "System", newStage: "New" }
    ],
    comments: []
  },
  {
    id: "CASE-7710",
    isNew: false,
    timestamp: new Date(2023, 10, 15, 21, 0),
    location: { 
      name: "Blue Lagoon Restobar", 
      lat: 19.0760, 
      lng: 72.8777, 
      city: "Mumbai",
      address: "Plot No. 12, Juhu Tara Rd, Mumbai, Maharashtra 400049",
      phone: "+91 22 2611 1234",
      email: "contact@bluelagoon.in"
    },
    pastOffences: 1,
    expectedFine: 25000,
    musicLabel: "T-Series",
    videoProofUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-in-a-nightclub-4351-large.mp4",
    aiExplanation: "Historical infraction. Settled out of court.",
    trustGates: { mediaHashKey: true, payloadSignature: true, clockSkewDetection: true, geofencingContinuity: true, deviceTrustBand: true },
    songAssessment: { title: "Jai Ho", artists: ["A.R. Rahman"], labelOwner: "T-Series", isrc: "IN-T12-08-00001", upc: "8901234560001", rightsAssociation: "IPRS" },
    absoluteProof: { smallVideoUrl: "", venueImages: [], obstructionFlags: "None", performanceContext: "Historical record" },
    evidenceVaults: [
      {
        id: "VAULT-1",
        name: "Evidence Vault 1",
        timestamp: new Date(2023, 10, 15, 21, 0),
        videoUrl: "",
        images: [],
        notes: "Historical vault."
      }
    ],
    chainOfCustody: [],
    stage: "Closed",
    qualityScore: 90,
    recoverableValue: 50000,
    auditTrail: [
      { id: "AUD-5", timestamp: new Date(2023, 10, 15, 21, 0), action: "Case Created", actor: "System", newStage: "New" },
      { id: "AUD-6", timestamp: new Date(2023, 10, 20, 10, 0), action: "Case Closed", actor: "Admin", previousStage: "Recovery In Progress", newStage: "Closed" }
    ],
    comments: [
      { id: "COM-1", timestamp: new Date(2023, 10, 16, 14, 0), author: "Admin", text: "Settlement reached.", role: "Admin" }
    ]
  },
  {
    id: "CASE-7711",
    isNew: false,
    timestamp: new Date(2024, 1, 20, 22, 30),
    location: { 
      name: "Blue Lagoon Restobar", 
      lat: 19.0760, 
      lng: 72.8777, 
      city: "Mumbai",
      address: "Plot No. 12, Juhu Tara Rd, Mumbai, Maharashtra 400049",
      phone: "+91 22 2611 1234",
      email: "contact@bluelagoon.in"
    },
    pastOffences: 2,
    expectedFine: 35000,
    musicLabel: "Zee Music Co.",
    videoProofUrl: "https://assets.mixkit.co/videos/preview/mixkit-people-dancing-in-a-nightclub-4351-large.mp4",
    aiExplanation: "Second infraction. Legal notice served.",
    trustGates: { mediaHashKey: true, payloadSignature: true, clockSkewDetection: true, geofencingContinuity: true, deviceTrustBand: true },
    songAssessment: { title: "Kala Chashma", artists: ["Badshah"], labelOwner: "Zee Music Co.", isrc: "IN-Z13-16-00001", upc: "8901234561111", rightsAssociation: "IPRS" },
    absoluteProof: { smallVideoUrl: "", venueImages: [], obstructionFlags: "None", performanceContext: "Historical record" },
    evidenceVaults: [
      {
        id: "VAULT-1",
        name: "Evidence Vault 1",
        timestamp: new Date(2024, 1, 20, 22, 30),
        videoUrl: "",
        images: [],
        notes: "Historical vault."
      }
    ],
    chainOfCustody: [],
    stage: "Recovery In Progress",
    qualityScore: 92,
    recoverableValue: 75000,
    auditTrail: [
      { id: "AUD-7", timestamp: new Date(2024, 1, 20, 22, 30), action: "Case Created", actor: "System", newStage: "New" }
    ],
    comments: []
  }
];
