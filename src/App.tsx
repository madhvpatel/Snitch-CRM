import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { 
  DndContext, 
  DragOverlay, 
  closestCorners, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { 
  Inbox, 
  Map as MapIcon, 
  Search, 
  Clock, 
  MapPin, 
  AlertCircle, 
  IndianRupee, 
  Music,
  CheckCircle2,
  ShieldCheck,
  Video,
  FileText,
  BarChart3,
  MoreVertical,
  ArrowUpDown,
  Star,
  ExternalLink,
  Shield,
  Fingerprint,
  Activity,
  Globe,
  Smartphone,
  Zap,
  Plus,
  Navigation,
  Columns,
  ArrowRight,
  Gavel,
  Phone,
  Mail,
  MessageSquare,
  Send,
  Link,
  History,
  Trophy,
  TrendingUp,
  Target,
  RefreshCcw,
  LockKeyhole,
  LogOut,
  X,
  ChevronDown,
  Info,
  Route,
  Building2,
  HelpCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence, type Variants } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, Polyline, Tooltip as LeafletTooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { format } from 'date-fns';
import { cn } from '@/src/lib/utils';
import { backfillPrototypeCaseAudioDeconstruction, fetchPrototypeCases, persistPrototypeCaseStage, reevaluatePrototypeCase } from '@/src/lib/prototypeApi';
import type {
  Case,
  CaseNarrativeLine,
  CaseStage,
  UserRole,
  AuditEntry,
  Comment as CaseComment,
  EvidenceVault,
  EnforcementWorkflowState,
  VenueIdentityStatus
} from './types';

// Custom Heatmap Layer for Leaflet
function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  
  useEffect(() => {
    // @ts-ignore
    const heatLayer = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 10,
      gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
    }).addTo(map);
    
    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, points]);
  
  return null;
}

// Fix for Leaflet marker icons
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type FilterType = 'time' | 'location' | 'offences' | 'fine' | 'label' | 'quality';
type CrmScreen = 'authority' | 'agent' | 'litigation';
type ActiveTab = 'venues' | 'cases' | 'map' | 'progress' | 'reports' | 'venue' | 'venue-resolution';
type AuthAccount = {
  username: string;
  password: string;
  screen: CrmScreen;
  role: UserRole;
  displayName: string;
  initials: string;
};

const AUTH_SESSION_KEY = 'vigil.crm.session';

const screenPath: Record<CrmScreen, string> = {
  authority: '/authority',
  agent: '/agent',
  litigation: '/litigation'
};

const demoAccounts: AuthAccount[] = [
  {
    username: 'authority@vigil.local',
    password: 'authority123',
    screen: 'authority',
    role: 'Admin',
    displayName: 'Admin User',
    initials: 'AD'
  },
  {
    username: 'agent@vigil.local',
    password: 'agent123',
    screen: 'agent',
    role: 'Agent',
    displayName: 'Field Agent',
    initials: 'FA'
  },
  {
    username: 'litigation@vigil.local',
    password: 'litigation123',
    screen: 'litigation',
    role: 'Lawyer',
    displayName: 'Legal Counsel',
    initials: 'LC'
  }
];

const getScreenFromPath = (): CrmScreen => {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/agent')) return 'agent';
  if (path.startsWith('/litigation')) return 'litigation';
  return 'authority';
};

const getAuthorityTabFromPath = (): ActiveTab => {
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/authority/venues/')) return 'venue';
  if (path.startsWith('/authority/venue-resolution')) return 'venue-resolution';
  // Venues is the default landing tab — browse by venue first, drill into cases.
  return 'venues';
};

const getCaseIdFromAuthorityVenuePath = () => {
  const match = window.location.pathname.match(/^\/authority\/venues\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
};

const getRoleForScreen = (screen: CrmScreen): UserRole => {
  if (screen === 'agent') return 'Agent';
  if (screen === 'litigation') return 'Lawyer';
  return 'Admin';
};

const getStoredAccount = () => {
  const storedUsername = window.sessionStorage.getItem(AUTH_SESSION_KEY);
  return demoAccounts.find((account) => account.username === storedUsername) || null;
};

const VALID_TRANSITIONS: Record<CaseStage, CaseStage[]> = {
  'New': ['Monitor / Enrich', 'Bad Case', 'Under Review'],
  'Monitor / Enrich': ['New', 'Under Review', 'Closed'],
  'Bad Case': ['New', 'Closed'],
  'Under Review': ['Agent Assignment', 'Ready For Legal', 'Recovery In Progress', 'Closed'],
  'Agent Assignment': ['Under Review', 'Recovery In Progress', 'Agent Assignment'], // Self-assignment for notes
  'Ready For Legal': ['Under Review', 'Closed', 'Ready For Legal'],
  'Recovery In Progress': ['Under Review', 'Closed', 'Ready For Legal', 'Recovery In Progress'],
  'Closed': ['Under Review']
};

const getPersonInitial = (name?: string, fallback = 'U') => {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return fallback;
  }

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const preferred = parts[1]?.[0] || parts[0]?.[0];
  return (preferred || fallback).toUpperCase();
};

const formatStemLabel = (stem?: string | null) => {
  const raw = String(stem || '').trim();
  if (!raw) {
    return 'Unknown Stem';
  }
  return raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

const getStemPriority = (stem?: string | null) => {
  switch (stem) {
    case 'music':
      return 0;
    case 'other':
      return 1;
    case 'vocals':
      return 2;
    case 'drums':
      return 3;
    case 'bass':
      return 4;
    default:
      return 10;
  }
};

const getDeconstructionStatusTone = (status?: string | null) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    case 'failed':
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    case 'skipped':
      return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    default:
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  }
};

const isTrackIdentificationFailed = (caseData: Case) => {
  const title = String(caseData.songAssessment?.title || '').trim().toLowerCase();
  const artist = String(caseData.songAssessment?.artists?.join(', ') || '').trim().toLowerCase();
  return title === 'unknown track' || artist === 'unknown artist';
};

const isVisualAnalyticsFailed = (caseData: Case, activeVaultIndex: number) => {
  const notes = String(caseData.evidenceVaults?.[activeVaultIndex]?.notes || '').toLowerCase();
  return notes.includes('visual ai analysis was unavailable')
    || notes.includes('peak-aligned frames were extracted, but visual ai analysis was unavailable')
    || notes.includes('no peak-aligned frames were extracted');
};

export default function App() {
  const [activeScreen, setActiveScreen] = useState<CrmScreen>(() => getScreenFromPath());
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => getAuthorityTabFromPath());
  const [signedInAccount, setSignedInAccount] = useState<AuthAccount | null>(() => getStoredAccount());
  const [allCases, setAllCases] = useState<Case[]>([]);
  const [backendCaseIds, setBackendCaseIds] = useState<Set<string>>(() => new Set());
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() => getCaseIdFromAuthorityVenuePath());
  const [sortBy, setSortBy] = useState<FilterType>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const userRole = signedInAccount?.role || getRoleForScreen(activeScreen);
  const [searchQuery, setSearchQuery] = useState('');
  const [listTab, setListTab] = useState<'upcoming' | 'active' | 'closed'>('active');
  
  const [invalidMoveId, setInvalidMoveId] = useState<string | null>(null);
  const [audioBackfillCaseIds, setAudioBackfillCaseIds] = useState<Set<string>>(() => new Set());
  const [reevaluatingCaseIds, setReevaluatingCaseIds] = useState<Set<string>>(() => new Set());
  
  // Advanced Intelligence State
  const [mapMode, setMapMode] = useState<'hotspots' | 'revenue'>('hotspots');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [vaultToDelete, setVaultToDelete] = useState<{caseId: string, vaultId: string} | null>(null);
  const [routeCaseIds, setRouteCaseIds] = useState<string[]>([]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveScreen(getScreenFromPath());
      setActiveTabState(getAuthorityTabFromPath());
      const routeCaseId = getCaseIdFromAuthorityVenuePath();
      if (routeCaseId) {
        setSelectedCaseId(routeCaseId);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!signedInAccount) {
      if (window.location.pathname !== '/') {
        window.history.replaceState({}, '', '/');
      }
      return;
    }

    if (activeScreen !== signedInAccount.screen) {
      window.history.replaceState({}, '', screenPath[signedInAccount.screen]);
      setActiveScreen(signedInAccount.screen);
    }
  }, [activeScreen, signedInAccount]);

  const navigateToScreen = (screen: CrmScreen, tab: ActiveTab = 'venues') => {
    if (signedInAccount && screen !== signedInAccount.screen) {
      return;
    }
    const nextPath = screen === 'authority' && tab === 'venue-resolution'
      ? '/authority/venue-resolution'
      : screenPath[screen];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setActiveScreen(screen);
    if (screen === 'authority') {
      setActiveTabState(tab);
    }
  };

  const openAuthorityVenueEvidence = (caseId: string) => {
    handleSelectCase(caseId);
    const nextPath = `/authority/venues/${encodeURIComponent(caseId)}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setActiveScreen('authority');
    setActiveTabState('venue');
  };

  const setActiveTab = (tab: string) => {
    if (tab === 'agent') {
      navigateToScreen('agent');
      return;
    }
    if (tab === 'litigation') {
      navigateToScreen('litigation');
      return;
    }
    navigateToScreen('authority', tab as ActiveTab);
  };

  const handleSignIn = (account: AuthAccount) => {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, account.username);
    setSignedInAccount(account);
    window.history.pushState({}, '', screenPath[account.screen]);
    setActiveScreen(account.screen);
    setActiveTabState('venues');
  };

  const handleSignOut = () => {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
    setSignedInAccount(null);
    window.history.pushState({}, '', '/');
    setActiveTabState('cases');
  };

  const loadCases = useCallback(async () => {
    try {
      const cases = await fetchPrototypeCases();
      setBackendCaseIds(new Set(cases.map((item) => item.id)));
      setAllCases(cases);
      setSelectedCaseId((currentId) => (
        cases.some((item) => item.id === currentId)
          ? currentId
          : (cases[0]?.id || null)
      ));
    } catch (error) {
      setBackendCaseIds(new Set());
      setAllCases([]);
      setSelectedCaseId(null);
      console.warn('[Authority API] Failed to load backend cases.', error);
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const filteredCases = useMemo(() => {
    let base = allCases;
    
    // Role-based filtering: Agents ONLY see assigned cases, period.
    if (userRole === 'Agent') {
      return base.filter(c => c.stage === 'Agent Assignment');
    }

    // Filter by tab for other roles
    if (listTab === 'upcoming') {
      base = base.filter(c => c.stage === 'New');
    } else if (listTab === 'active') {
      base = base.filter(c => ['Under Review', 'Agent Assignment', 'Ready For Legal', 'Recovery In Progress'].includes(c.stage));
    } else if (listTab === 'closed') {
      base = base.filter(c => c.stage === 'Closed');
    }

    if (!searchQuery) return base;
    const query = searchQuery.toLowerCase();
    return base.filter(c => 
      c.id.toLowerCase().includes(query) ||
      c.location.name.toLowerCase().includes(query) ||
      c.location.city.toLowerCase().includes(query) ||
      c.songAssessment.title.toLowerCase().includes(query) ||
      c.songAssessment.isrc.toLowerCase().includes(query) ||
      c.musicLabel.toLowerCase().includes(query)
    );
  }, [allCases, searchQuery, listTab, userRole]);

  const selectedCase = useMemo(() => {
    const found = filteredCases.find(c => c.id === selectedCaseId);
    if (found) return found;
    if (filteredCases.length > 0) return filteredCases[0];
    return null; // No fallback to allCases[0] if it's not in filtered list
  }, [selectedCaseId, filteredCases]);

  const updateCaseStage = (id: string, newStage: CaseStage, notes?: string, assignmentType?: 'Agent' | 'Lawyer', agentResolutionNote?: string, resolvedByAgentName?: string, selectedVaultIds?: string[], agentActionTaken?: string) => {
    const agents = ['Agent Smith', 'Agent Johnson', 'Agent Williams', 'Agent Brown'];
    const lawyers = ['Lawyer Davis', 'Lawyer Miller', 'Lawyer Wilson', 'Lawyer Moore'];
    const currentCase = allCases.find(c => c.id === id);
    const isValidTransition = Boolean(currentCase && (currentCase.stage === newStage || VALID_TRANSITIONS[currentCase.stage].includes(newStage)));
    const shouldPersistStage = Boolean(
      currentCase
      && currentCase.stage !== newStage
      && isValidTransition
      && backendCaseIds.has(id)
    );

    if (shouldPersistStage) {
      persistPrototypeCaseStage(id, newStage, userRole, notes).catch((error) => {
        console.warn(`[Authority API] Failed to persist stage change for ${id}.`, error);
      });
    }
    
    setAllCases(prev => prev.map(c => {
      if (c.id === id) {
        // Prevent unauthorized teleportation between stages
        if (c.stage !== newStage && !VALID_TRANSITIONS[c.stage].includes(newStage)) {
          console.warn(`[Security] Unauthorized stage transition blocked: ${c.stage} -> ${newStage}`);
          return c;
        }

        const assignedTo = assignmentType === 'Agent' 
          ? agents[Math.floor(Math.random() * agents.length)]
          : assignmentType === 'Lawyer'
            ? lawyers[Math.floor(Math.random() * lawyers.length)]
            : c.assignedTo;
            
        const auditEntry: AuditEntry = {
          id: `AUD-${Date.now()}`,
          timestamp: new Date(),
          action: c.stage === newStage ? "Action Logged" : "Stage Updated",
          actor: userRole,
          previousStage: c.stage,
          newStage: newStage,
          details: notes || "No additional notes provided."
        };

        return { 
          ...c, 
          stage: newStage, 
          notes: notes || c.notes,
          assignedTo,
          assignmentType: assignmentType || c.assignmentType,
          agentResolutionNote: agentResolutionNote || c.agentResolutionNote,
          agentActionTaken: agentActionTaken || c.agentActionTaken,
          hasBeenSentToAgent: c.hasBeenSentToAgent || assignmentType === 'Agent',
          resolvedByAgentName: resolvedByAgentName || c.resolvedByAgentName,
          selectedVaultIds: selectedVaultIds || c.selectedVaultIds,
          auditTrail: [...c.auditTrail, auditEntry],
          // Sync update: If user is acting on this case, clear current notification flags
          // to prevent race conditions with background effect tasks
          unreadMajorChanges: false,
          unreadComments: false
        };
      }
      return c;
    }));
  };

  const addComment = (id: string, text: string) => {
    setAllCases(prev => prev.map(c => {
      if (c.id === id) {
        const newComment: CaseComment = {
          id: `COM-${Date.now()}`,
          timestamp: new Date(),
          author: userRole === 'Admin' ? 'Admin User' : userRole === 'Lawyer' ? 'Legal Counsel' : 'Field Agent',
          text,
          role: userRole
        };
        return {
          ...c,
          comments: [...c.comments, newComment],
          unreadComments: true
        };
      }
      return c;
    }));
    addNotification(`New message in Case ${id}: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`, 'info');
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const caseId = active.id as string;
    const stages: CaseStage[] = ['New', 'Monitor / Enrich', 'Bad Case', 'Under Review', 'Agent Assignment', 'Ready For Legal', 'Recovery In Progress', 'Closed'];
    
    let newStage: CaseStage | null = null;
    
    // Resolve target stage
    if (stages.includes(over.id as CaseStage)) {
      newStage = over.id as CaseStage;
    } else {
      const overCase = allCases.find(c => c.id === over.id);
      if (overCase) {
        newStage = overCase.stage;
      }
    }

    if (!newStage) return;
    
    const caseToMove = allCases.find(c => c.id === caseId);
    if (!caseToMove) return;

    const currentIdx = stages.indexOf(caseToMove.stage);
    const newIdx = stages.indexOf(newStage);

    // Constraints:
    // 1. Cannot move to 'New'
    // 2. Cannot move forward (newIdx > currentIdx)
    // 3. Can only move backward (newIdx < currentIdx)
    if (newStage !== 'New' && newIdx < currentIdx) {
      updateCaseStage(caseId, newStage);
    } else if (newStage !== caseToMove.stage) {
      // Invalid move animation trigger
      setInvalidMoveId(caseId);
      setTimeout(() => setInvalidMoveId(null), 500);
    }
  };

  const handleSelectCase = (id: string) => {
    setSelectedCaseId(id);
    setAllCases(prev => prev.map(item => {
      if (item.id === id) {
        let updates: Partial<Case> = { unreadComments: false, unreadMajorChanges: false };
        if (item.isNew) {
          updates = { ...updates, isNew: false };
        }
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const clearNotification = (id: string, type: 'major' | 'comments') => {
    setAllCases(prev => prev.map(c => {
      if (c.id === id) {
        return {
          ...c,
          unreadComments: type === 'comments' ? false : c.unreadComments,
          unreadMajorChanges: type === 'major' ? false : c.unreadMajorChanges
        };
      }
      return c;
    }));
  };

  const [notifications, setNotifications] = useState<{ id: string; message: string; type: 'major' | 'info' }[]>([]);

  const addNotification = (message: string, type: 'major' | 'info' = 'info') => {
    const id = `NOTIF-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setNotifications(prev => [...prev.filter(n => n.message !== message), { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  // Phase 2 (advanced enrichment) is async on the server — it enriches the same
  // report in place. We queue it, tell the user it's running, then re-fetch
  // after a delay so the now-'full' case data appears without a manual reload.
  // Phase 2 (advanced enrichment) is async on the server — it enriches the same
  // report in place. We queue it, tell the user it's running, then re-fetch
  // after a delay so the now-'full' case data appears without a manual reload.
  const runAdvancedEnrichment = async (
    caseId: string,
    label: string,
    trigger: (id: string, role: UserRole) => Promise<unknown>,
  ) => {
    try {
      await trigger(caseId, userRole);
      addNotification(`${caseId}: ${label} queued — enrichment is running. Refreshing shortly…`, 'major');
      setTimeout(() => { loadCases(); }, 20000);
    } catch (error) {
      addNotification(`${caseId}: failed to queue ${label} — ${(error as Error).message}`, 'major');
    }
  };

  const triggerAudioDeconstructionBackfill = async (caseId: string) => {
    await runAdvancedEnrichment(caseId, 'Audio deconstruction', backfillPrototypeCaseAudioDeconstruction);
  };

  const triggerCaseReevaluation = async (caseId: string) => {
    await runAdvancedEnrichment(caseId, 'Re-evaluation', reevaluatePrototypeCase);
  };

  const createEvidenceVault = (caseId: string) => {
    setAllCases(prev => prev.map(c => {
      if (c.id === caseId) {
        const vaultNumber = (c.evidenceVaults?.length || 0) + 1;
        const newVault: EvidenceVault = {
          id: `VAULT-${Date.now()}`,
          name: `Evidence Vault ${vaultNumber}`,
          timestamp: new Date(),
          images: [],
          notes: `Additional evidence vault created by agent.`
        };

        const auditEntry: AuditEntry = {
          id: `AUD-${Date.now()}`,
          timestamp: new Date(),
          action: "Evidence Vault Created",
          actor: userRole,
          details: `New evidence vault initiated: ${newVault.name}`
        };

        const comment: CaseComment = {
          id: `COM-${Date.now()}`,
          timestamp: new Date(),
          author: "Field Agent",
          text: `🚨 MAJOR: ${newVault.name} has been initiated for this case.`,
          role: 'Agent'
        };

        addNotification(`New Evidence Vault created for ${c.id}`, 'major');

        return {
          ...c,
          evidenceVaults: [...(c.evidenceVaults || []), newVault],
          auditTrail: [...c.auditTrail, auditEntry],
          comments: [...c.comments, comment],
          unreadMajorChanges: true
        };
      }
      return c;
    }));
  };

  const deleteEvidenceVault = (caseId: string, vaultId: string) => {
    setAllCases(prev => prev.map(c => {
      if (c.id === caseId) {
        return {
          ...c,
          evidenceVaults: (c.evidenceVaults || []).filter(v => v.id !== vaultId),
          selectedVaultIds: c.selectedVaultIds?.filter(id => id !== vaultId),
          auditTrail: [...c.auditTrail, {
            id: `AUD-${Date.now()}`,
            timestamp: new Date(),
            action: "Evidence Vault Removed",
            actor: userRole,
            details: `Evidence vault ${vaultId} was deleted by Admin.`
          }]
        };
      }
      return c;
    }));
    setVaultToDelete(null);
  };

  const requestMoreProof = (caseId: string, vaultId: string) => {
    setAllCases(prev => prev.map(c => {
      if (c.id === caseId) {
        return {
          ...c,
          evidenceVaults: c.evidenceVaults.map(v => 
            v.id === vaultId ? { ...v, moreProofRequested: true } : v
          ),
          auditTrail: [...c.auditTrail, {
            id: `AUD-${Date.now()}`,
            timestamp: new Date(),
            action: "More Proof Requested",
            actor: userRole,
            details: `Admin requested additional proof for ${vaultId}.`
          }]
        };
      }
      return c;
    }));
  };

  const sortedCases = useMemo(() => {
    return [...filteredCases].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'time':
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case 'location':
          comparison = a.location.city.localeCompare(b.location.city);
          break;
        case 'offences':
          comparison = a.pastOffences - b.pastOffences;
          break;
        case 'fine':
          comparison = a.expectedFine - b.expectedFine;
          break;
        case 'label':
          comparison = a.musicLabel.localeCompare(b.musicLabel);
          break;
        case 'quality':
          // qualityScore has no model behind it (always 0 in production); sort
          // by the real facts it stood in for instead: identified-or-not, then
          // how many trust gates actually passed.
          comparison = (Number(isTrackIdentified(a)) - Number(isTrackIdentified(b)))
            || (getTrustPassCount(a) - getTrustPassCount(b));
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [sortBy, sortOrder, filteredCases]);

  useEffect(() => {
    // Mark initial case as read on load
    if (selectedCaseId) {
      const c = allCases.find(item => item.id === selectedCaseId);
      if (c && (c.isNew || c.stage === 'New')) {
        handleSelectCase(selectedCaseId);
      }
    }
  }, []);

  useEffect(() => {
    if (userRole === 'Agent') {
      setListTab('active');
    }
  }, [userRole]);

  const toggleSort = (type: FilterType) => {
    if (sortBy === type) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortOrder('desc');
    }
  };

  if (!signedInAccount) {
    return <SignInScreen onSignIn={handleSignIn} />;
  }

  return (
    <div className="crm-shell flex h-dvh min-h-0 w-full bg-slate-950 text-slate-100 font-sans">
      {/* Major Notifications Overlay */}
      <div className="fixed top-10 right-10 z-[200] space-y-4 pointer-events-none">
        <AnimatePresence>
          {notifications.map(notif => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.95 }}
              className={cn(
                "p-6 rounded-[24px] border shadow-2xl backdrop-blur-xl pointer-events-auto min-w-[280px] md:min-w-[320px] max-w-[calc(100vw-3rem)]",
                notif.type === 'major' 
                  ? "bg-brand-indigo/10 border-brand-indigo/30 text-brand-indigo shadow-brand-indigo/20" 
                  : "bg-white/5 border-white/10 text-text-primary shadow-black/40"
              )}
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center",
                  notif.type === 'major' ? "bg-brand-indigo text-white" : "bg-white/10 text-text-tertiary"
                )}>
                  {notif.type === 'major' ? <Zap className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1 opacity-60">
                    {notif.type === 'major' ? 'Major Update' : 'Notification'}
                  </p>
                  <p className="text-sm font-bold tracking-tight">{notif.message}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sidebar */}
      <aside className="w-16 md:w-64 border-r border-slate-800 flex min-h-0 flex-col bg-slate-900/50">
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            <Shield className="text-white w-5 h-5" />
          </div>
          <span className="hidden md:block font-bold text-lg tracking-tight text-white">Vigil</span>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4">
          <div className="pb-2 px-3">
            <p className="hidden md:block text-[10px] font-bold uppercase tracking-widest text-slate-500">Workspace</p>
          </div>
          <div className="mx-1 mb-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white">
                {activeScreen === 'authority' ? (
                  <Shield className="h-4 w-4" />
                ) : activeScreen === 'agent' ? (
                  <Smartphone className="h-4 w-4" />
                ) : (
                  <Gavel className="h-4 w-4" />
                )}
              </div>
              <div className="hidden min-w-0 md:block">
                <p className="truncate text-xs font-black uppercase tracking-widest text-white">
                  {activeScreen === 'authority' ? 'Authority' : activeScreen === 'agent' ? 'Agent' : 'Litigation'}
                </p>
                <p className="truncate text-[10px] font-medium text-slate-500">{signedInAccount.username}</p>
              </div>
            </div>
          </div>

          {activeScreen === 'authority' && (
            <>
              <div className="pt-6 pb-2 px-3">
                <p className="hidden md:block text-tiny uppercase tracking-widest text-text-quaternary">Authority</p>
              </div>
              <NavItem
                active={activeTab === 'venues'}
                onClick={() => setActiveTab('venues')}
                icon={<Building2 className="w-4 h-4" />}
                label="Venues"
              />
              <NavItem
                active={activeTab === 'cases'}
                onClick={() => setActiveTab('cases')}
                icon={<Inbox className="w-4 h-4" />}
                label="Cases"
              />
              <NavItem 
                active={activeTab === 'map'} 
                onClick={() => setActiveTab('map')} 
                icon={<MapIcon className="w-4 h-4" />} 
                label="Map Intelligence" 
              />
              <NavItem 
                active={activeTab === 'progress'} 
                onClick={() => setActiveTab('progress')} 
                icon={<Columns className="w-4 h-4" />} 
                label="Progress" 
              />
              <NavItem
                active={activeTab === 'venue-resolution'}
                onClick={() => setActiveTab('venue-resolution')}
                icon={<Route className="w-4 h-4" />}
                label="Venue Resolution"
              />
              <NavItem 
                active={activeTab === 'reports'} 
                onClick={() => setActiveTab('reports')} 
                icon={<BarChart3 className="w-4 h-4" />} 
                label="Reports" 
              />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
              {signedInAccount.initials}
            </div>
            <div className="hidden md:block overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">
                {signedInAccount.displayName}
              </p>
              <p className="text-[10px] text-slate-500 truncate">{userRole}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Sign out"
            onClick={handleSignOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:border-red-500/30 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-h-0 flex-1 flex flex-col overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeScreen}-${activeTab}`}
            initial={{ opacity: 0, scale: 0.99, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.01, y: -5 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="min-h-0 flex-1 flex flex-col overflow-hidden"
          >
            {activeScreen === 'agent' ? (
              <AgentProofGapWorkspace
                cases={allCases.filter(c => c.stage === 'Agent Assignment')} 
                onSelectCase={handleSelectCase}
                onUpdateStage={updateCaseStage}
                setActiveTab={setActiveTab}
                onCreateVault={createEvidenceVault}
                routeCaseIds={routeCaseIds}
                setRouteCaseIds={setRouteCaseIds}
              />
            ) : activeScreen === 'litigation' ? (
              <LitigationClaimReadiness
                allCases={allCases} 
                onSelectCase={handleSelectCase}
                onUpdateStage={updateCaseStage}
                setActiveTab={setActiveTab}
                onRunSignalAnalysis={triggerCaseReevaluation}
                onRunDemucs={triggerAudioDeconstructionBackfill}
                runningSignalAnalysisIds={reevaluatingCaseIds}
                runningDemucsIds={audioBackfillCaseIds}
              />
            ) : activeTab === 'venues' ? (
              <VenueListPage cases={allCases} onOpenVenue={openAuthorityVenueEvidence} />
            ) : activeTab === 'cases' ? (
              <AuthorityDecisionCockpit
                cases={allCases}
                selectedCaseId={selectedCaseId}
                onSelectCase={handleSelectCase}
                onOpenVenueEvidence={openAuthorityVenueEvidence}
                onUpdateStage={updateCaseStage}
                onRequestMoreProof={(caseId, vaultId) => requestMoreProof(caseId, vaultId)}
                setActiveTab={setActiveTab}
                setListTab={setListTab}
                onRunSignalAnalysis={triggerCaseReevaluation}
                onRunDemucs={triggerAudioDeconstructionBackfill}
                runningSignalAnalysisIds={reevaluatingCaseIds}
                runningDemucsIds={audioBackfillCaseIds}
              />
            ) : activeTab === 'venue' ? (
              <AuthorityVenueEvidencePage
                cases={allCases}
                selectedCaseId={selectedCaseId}
                onSelectCase={handleSelectCase}
                onUpdateStage={updateCaseStage}
                onRequestMoreProof={(caseId, vaultId) => requestMoreProof(caseId, vaultId)}
                setActiveTab={setActiveTab}
                setListTab={setListTab}
                onRunSignalAnalysis={triggerCaseReevaluation}
                onRunDemucs={triggerAudioDeconstructionBackfill}
                runningSignalAnalysisIds={reevaluatingCaseIds}
                runningDemucsIds={audioBackfillCaseIds}
              />
            ) : activeTab === 'map' ? (
              <div className="flex-1 relative">
                <div className="absolute top-6 left-6 z-[1000] bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl w-80">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-widest">
                      <Activity className="w-4 h-4 text-blue-400" />
                      Map Intelligence
                    </h3>
                    <div className="flex bg-slate-800 p-1 rounded-lg">
                      <button 
                        onClick={() => setMapMode('hotspots')}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-md transition-all relative z-10",
                          mapMode === 'hotspots' ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {mapMode === 'hotspots' && (
                          <motion.div 
                            layoutId="map-mode-bg"
                            className="absolute inset-0 bg-slate-700 rounded-md -z-10 shadow-sm"
                          />
                        )}
                        Hotspots
                      </button>
                      <button 
                        onClick={() => setMapMode('revenue')}
                        className={cn(
                          "px-3 py-1 text-[10px] font-bold rounded-md transition-all relative z-10",
                          mapMode === 'revenue' ? "text-blue-400" : "text-slate-400 hover:text-slate-200"
                        )}
                      >
                        {mapMode === 'revenue' && (
                          <motion.div 
                            layoutId="map-mode-bg"
                            className="absolute inset-0 bg-slate-700 rounded-md -z-10 shadow-sm"
                          />
                        )}
                        Revenue
                      </button>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Detection</span>
                        <button 
                          onClick={() => setIsLiveMode(!isLiveMode)}
                          className={cn(
                            "w-10 h-5 rounded-full relative transition-all",
                            isLiveMode ? "bg-blue-600" : "bg-slate-700"
                          )}
                        >
                          <motion.div 
                            layout
                            className={cn(
                              "absolute top-1 w-3 h-3 bg-white rounded-full",
                              isLiveMode ? "left-6" : "left-1"
                            )} 
                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Heatmap Intensity</span>
                        <span className="text-[10px] font-black text-white">HIGH</span>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <p className="text-[11px] font-bold text-slate-200">
                          {isLiveMode ? 'Monitoring live streams...' : 'Static analysis mode'}
                        </p>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        {mapMode === 'hotspots' 
                            ? 'Visualizing individual infringement events with real-time trust verification.' 
                            : 'Aggregating unrecovered licensing revenue density across urban centers.'}
                      </p>
                    </div>
                  </div>
                </div>

                <MapContainer center={[20.5937, 78.9629]} zoom={5} scrollWheelZoom={true} className="z-0">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  />
                  
                  <MapBoundsUpdater 
                    points={allCases.map(c => [c.location.lat, c.location.lng] as [number, number])} 
                  />

                  {mapMode === 'revenue' && (
                    <HeatmapLayer 
                      points={allCases.map(c => [c.location.lat, c.location.lng, c.recoverableValue / 10000] as [number, number, number])} 
                    />
                  )}

                  {mapMode === 'hotspots' && (
                    <Polyline 
                      positions={allCases
                        .filter(c => c.stage !== 'Closed')
                        .sort((a,b) => b.expectedFine - a.expectedFine)
                        .slice(0, 5)
                        .map(c => [c.location.lat, c.location.lng] as [number, number])} 
                      pathOptions={{ color: '#3b82f6', weight: 1, opacity: 0.3, dashArray: '5, 10' }}
                    />
                  )}

                  {mapMode === 'hotspots' && allCases.map((c) => (
                    <React.Fragment key={c.id}>
                      <CircleMarker 
                        center={[c.location.lat, c.location.lng]}
                        radius={isLiveMode && c.isNew ? 30 : 20}
                        pathOptions={{ 
                          fillColor: 
                            c.stage === 'New' ? '#3b82f6' : 
                            c.stage === 'Under Review' ? '#f59e0b' :
                            c.stage === 'Agent Assignment' ? '#06b6d4' :
                            c.stage === 'Ready For Legal' ? '#10b981' :
                            c.stage === 'Recovery In Progress' ? '#a855f7' : '#64748b', 
                          fillOpacity: isLiveMode && c.isNew ? 0.3 : 0.15, 
                          color: 'transparent' 
                        }}
                        className={cn(isLiveMode && c.isNew ? "animate-pulse-live" : "")}
                      >
                        <LeafletTooltip direction="top" offset={L.point(0, -20)} opacity={1} permanent={false}>
                          <div className="bg-slate-950 border border-slate-800 p-2 rounded-lg shadow-xl text-white min-w-[140px]">
                             <p className="text-[10px] font-black uppercase text-blue-400 mb-0.5">{c.id}</p>
                             <p className="text-xs font-black leading-tight mb-1">{c.location.name}</p>
                             <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/5">
                               <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Value: ₹{(c.expectedFine/1000).toFixed(0)}k</span>
                               <span className={cn(
                                 "text-[8px] font-black uppercase px-1 rounded",
                                 c.stage === 'New' ? "text-blue-400 bg-blue-400/10" : "text-emerald-400 bg-emerald-400/10"
                               )}>{c.stage.split(' ')[0]}</span>
                             </div>
                          </div>
                        </LeafletTooltip>
                      </CircleMarker>
                      <Marker 
                        position={[c.location.lat, c.location.lng]}
                        icon={L.divIcon({
                          className: 'custom-marker-icon',
                          html: `<div class="marker-pin-wrapper" style="position: relative; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
                                   <div style="background-color: ${c.stage === 'New' ? '#3b82f6' : '#10b981'}; color: white; width: 32px; height: 32px; border-radius: 10px; border: 2px solid #0f172a; display: flex; align-items: center; justify-content: center;">
                                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                                   </div>
                                   <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 6px solid ${c.stage === 'New' ? '#3b82f6' : '#10b981'}; margin-top: -2px; filter: drop-shadow(0 -1px 0 #0f172a);"></div>
                                 </div>`,
                          iconSize: [32, 40],
                          iconAnchor: [16, 38],
                          popupAnchor: [0, -32]
                        })}
                      >
                        <Popup className="custom-popup">
                          <div className="p-5 min-w-[280px]">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">{c.id}</span>
                                <span className="text-[9px] text-slate-400 font-bold">{format(c.timestamp, 'HH:mm')}</span>
                              </div>
                              <span className={cn(
                                "px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-widest",
                                c.stage === 'New' ? "bg-blue-900/40 text-blue-400" : 
                                c.stage === 'Under Review' ? "bg-amber-900/40 text-amber-400" :
                                c.stage === 'Agent Assignment' ? "bg-cyan-900/40 text-cyan-400" :
                                c.stage === 'Ready For Legal' ? "bg-emerald-900/40 text-emerald-400" :
                                c.stage === 'Recovery In Progress' ? "bg-purple-900/40 text-purple-400" :
                                "bg-slate-900/40 text-slate-400"
                              )}>{c.stage}</span>
                            </div>
                            <h4 className="font-black text-white text-base mb-1 tracking-tight">{c.location.name}</h4>
                            <p className="text-xs text-slate-400 font-bold mb-5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {c.location.city}
                            </p>
                            
                            <div className="grid grid-cols-2 gap-6 py-4 border-y border-slate-800">
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Potential</p>
                                <p className="text-sm font-black text-white">₹{c.recoverableValue.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-500 uppercase font-black tracking-widest mb-1">Track</p>
                                <p className="text-sm font-black text-white">{trackIdentityLabel(c)}</p>
                              </div>
                            </div>
                            
                            <button 
                              onClick={() => {
                                handleSelectCase(c.id);
                                setActiveTab('cases');
                              }}
                              className="w-full mt-5 py-3 bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-800 transition-all shadow-lg shadow-blue-700/20"
                            >
                              Access Evidence Vault
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    </React.Fragment>
                  ))}
                </MapContainer>
                
                <MapStatsOverlay cases={allCases} />
              </div>
            ) : activeTab === 'progress' ? (
              <KanbanBoard 
                cases={allCases} 
                onSelectCase={(id) => {
                  handleSelectCase(id);
                  setActiveTab('cases');
                }}
                onDragEnd={onDragEnd}
                invalidMoveId={invalidMoveId}
              />
            ) : activeTab === 'venue-resolution' ? (
              <VenueResolutionQueue
                cases={allCases}
                onSelectCase={(id) => {
                  handleSelectCase(id);
                  openAuthorityVenueEvidence(id);
                }}
              />
            ) : activeTab === 'reports' ? (
              <ReportsDashboard allCases={allCases} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {vaultToDelete && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-bg-panel border border-border-standard rounded-[32px] p-8 max-w-md w-full shadow-2xl"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
                <AlertCircle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-xl font-black text-text-primary tracking-tight mb-3">Delete Evidence Vault?</h3>
              <p className="text-sm font-bold text-text-secondary leading-relaxed mb-8">
                Are you sure you want to delete this evidence vault? This action is irreversible and the forensic data will be permanently removed.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setVaultToDelete(null)}
                  className="flex-1 py-3 bg-white/[0.04] hover:bg-white/[0.08] text-text-secondary text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-border-standard"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteEvidenceVault(vaultToDelete.caseId, vaultToDelete.vaultId)}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-red-600/20"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SignInScreen({ onSignIn }: { onSignIn: (account: AuthAccount) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const account = demoAccounts.find((item) => (
      item.username === username.trim().toLowerCase() && item.password === password
    ));

    if (!account) {
      setError('Invalid credentials for this CRM workspace.');
      return;
    }

    setError('');
    onSignIn(account);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8 items-stretch">
        <section className="flex flex-col justify-between rounded-[32px] border border-slate-800 bg-slate-900/50 p-8 lg:p-10 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-black tracking-tight text-white">Vigil</p>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">CRM Access</p>
              </div>
            </div>
            <h1 className="max-w-2xl text-4xl font-black tracking-tight text-white lg:text-5xl">
              Sign in to open your assigned workspace.
            </h1>
            <p className="mt-5 max-w-xl text-sm font-medium leading-7 text-slate-400">
              Each account is mapped to one CRM surface. Authority, field agent, and litigation access are separated at sign-in.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-3">
            {demoAccounts.map((account) => (
              <div key={account.username} className="rounded-2xl border border-white/5 bg-slate-950/50 p-4">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-blue-300">
                  {account.screen === 'authority' ? (
                    <Shield className="h-4 w-4" />
                  ) : account.screen === 'agent' ? (
                    <Smartphone className="h-4 w-4" />
                  ) : (
                    <Gavel className="h-4 w-4" />
                  )}
                </div>
                <p className="text-[10px] font-black uppercase tracking-widest text-white">{account.screen}</p>
                <p className="mt-2 break-all text-[11px] font-medium text-slate-400">{account.username}</p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">{account.password}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[32px] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-black/30">
          <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 border border-slate-800">
            <LockKeyhole className="h-5 w-5 text-blue-400" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">Sign In</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">Use the credentials for the workspace you need.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="crm-email" className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Account
              </label>
              <input
                id="crm-email"
                type="email"
                autoComplete="username"
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setError('');
                }}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-700 focus:border-blue-500"
                placeholder="name@vigil.local"
              />
            </div>
            <div>
              <label htmlFor="crm-password" className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                Password
              </label>
              <input
                id="crm-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError('');
                }}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-semibold text-white outline-none transition-colors placeholder:text-slate-700 focus:border-blue-500"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

const CORE_TRUST_GATE_KEYS = ['mediaHashKey', 'payloadSignature', 'clockSkewDetection', 'geofencingContinuity', 'deviceTrustBand'] as const;
const getTrustPassCount = (caseData: Case) => CORE_TRUST_GATE_KEYS.filter((key) => caseData.trustGates[key]).length;

const venueIdentityLabels: Record<VenueIdentityStatus, string> = {
  RESOLVED: 'Resolved',
  APPROXIMATE: 'Approximate',
  UNRESOLVED: 'Unresolved'
};

const emptyWorkflowSnapshot = (caseData: Case): EnforcementWorkflowState => ({
  repeatCaptureSummary: {
    confirmedIncidentCount: 0,
    distinctCaptureDates: 0,
    distinctDetectedSongs: 0
  },
  venueIdentity: {
    status: 'UNRESOLVED',
    displayLabel: 'Unresolved',
    coordinates: { lat: caseData.location.lat, lng: caseData.location.lng },
    candidateVenueCount: 0,
    assignmentStatus: 'Unassigned',
    followUpStatus: 'Review required'
  }
});

const getWorkflowState = (caseData: Case): EnforcementWorkflowState => ({
  ...emptyWorkflowSnapshot(caseData),
  ...(caseData.enforcement || {})
});

const formatOptionalDateTime = (value?: string | Date) => {
  if (!value) return 'Not checked';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not checked';
  return format(parsed, 'MMM dd, yyyy HH:mm');
};

// caseData.qualityScore has no model behind it in production (always 0 — see
// server's "no quality model" comment) and was rendered everywhere as a fake
// X/10. The real, always-available binary fact it stood in for is whether the
// pipeline resolved a song at all.
const isTrackIdentified = (caseData: Case) => Boolean(
  caseData.songAssessment.title && caseData.songAssessment.title !== 'Unknown Track'
);
const trackIdentityLabel = (caseData: Case) => (isTrackIdentified(caseData) ? 'Identified' : 'Not identified');

const getIncidentTimeline = (caseData: Case, venueCases: Case[] = []) => {
  const workflow = getWorkflowState(caseData);
  if (workflow.incidentTimeline?.length) return workflow.incidentTimeline;

  return [...venueCases, caseData]
    .filter((item, index, source) => source.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime())
    .map((item) => ({
      id: item.id,
      capturedAt: item.timestamp.toISOString(),
      detectedSong: item.songAssessment.title || 'Unknown track',
      evidenceConfidence: item.qualityScore,
      hasForensicArtifacts: Boolean(item.audioDeconstruction?.artifacts?.length || item.evidenceVaults.length),
      status: item.stage,
      sourceLocation: item.location.name || `${item.location.lat}, ${item.location.lng}`
    }));
};

const getRepeatSummary = (caseData: Case, venueCases: Case[] = []) => {
  const workflow = getWorkflowState(caseData);
  if (workflow.repeatCaptureSummary) return workflow.repeatCaptureSummary;
  const timeline = getIncidentTimeline(caseData, venueCases);
  const dates = new Set(timeline.map((entry) => format(new Date(entry.capturedAt), 'yyyy-MM-dd')));
  const songs = new Set(timeline.map((entry) => entry.detectedSong));
  return {
    confirmedIncidentCount: timeline.length,
    distinctCaptureDates: dates.size,
    distinctDetectedSongs: songs.size,
    firstDetectedAt: timeline[0]?.capturedAt,
    latestDetectedAt: timeline[timeline.length - 1]?.capturedAt
  };
};

// The old single weighted number mixed real signals (trust gates) with
// always-zero production fields (qualityScore, pastOffences, recoverableValue
// — no model exists for any of them yet), so in practice it collapsed to
// trust-gate count anyway. Made explicit as tiers instead of a fabricated sum:
// 1) a venue dispute needs eyes first, 2) more trust gates passed sorts higher,
// 3) most recent capture breaks ties.
const compareCasesByPriority = (a: Case, b: Case) => {
  const aDisputed = a.venueAttribution?.status === 'adjacent_mismatch' ? 1 : 0;
  const bDisputed = b.venueAttribution?.status === 'adjacent_mismatch' ? 1 : 0;
  if (aDisputed !== bDisputed) return bDisputed - aDisputed;

  const trustDiff = getTrustPassCount(b) - getTrustPassCount(a);
  if (trustDiff !== 0) return trustDiff;

  return b.timestamp.getTime() - a.timestamp.getTime();
};

type PerformanceContextGrade = 'strong' | 'medium' | 'weak' | 'invalid';

const getRightsBodies = (caseData: Case) => {
  const raw = `${caseData.songAssessment.rightsAssociation || ''} ${caseData.musicLabel || ''}`.toLowerCase();
  const bodies: Array<'IPRS' | 'PPL' | 'Novex'> = [];
  if (raw.includes('iprs')) bodies.push('IPRS');
  if (raw.includes('ppl')) bodies.push('PPL');
  if (raw.includes('novex')) bodies.push('Novex');
  return bodies;
};

const getEvidenceText = (caseData: Case) => [
  caseData.absoluteProof.performanceContext,
  caseData.absoluteProof.obstructionFlags,
  caseData.aiExplanation,
  ...caseData.evidenceVaults.map((vault) => vault.notes || '')
].join(' ').toLowerCase();

const getPlaybackSourceProfile = (caseData: Case) => {
  const evidenceText = getEvidenceText(caseData);
  const hasRecordedPlayback = [
    'room playback',
    'recorded music',
    'music video',
    'on-screen content',
    'large tv',
    'tv screen',
    'speaker',
    'speakers',
    'pa system',
    'venue-wide pa',
    'installed venue-wide pa',
    'ceiling speaker',
    'playback'
  ].some((signal) => evidenceText.includes(signal));
  const hasLivePerformance = [
    'visual analysis: performer',
    'performer visible',
    'singer visible',
    'musician visible',
    'artist performing',
    'live band',
    'band performing',
    'instrument on stage',
    'microphone on stage',
    'vocalist on stage',
    'snitch confirmed live performance',
    'snitch observed performer',
    'snitch comment: live performance',
    'agent observed live performance',
    'field agent confirmed live performance',
    'witnessed live performance'
  ].some((signal) => evidenceText.includes(signal));

  if (hasLivePerformance) {
    return {
      sourceType: 'live' as const,
      label: 'Live performer evidence',
      evidenceNeed: 'Show the performer, stage, instruments, microphone, or explicit snitch confirmation.'
    };
  }

  if (hasRecordedPlayback) {
    return {
      sourceType: 'playback' as const,
      label: 'Recorded music playback',
      evidenceNeed: 'Show the recording was played through speakers, TV, PA, DJ system, or another venue playback source.'
    };
  }

  return {
    sourceType: 'unknown' as const,
    label: 'Source not classified',
    evidenceNeed: 'Classify the source as venue playback, DJ playback, TV/video playback, or live performer evidence.'
  };
};

const getViolationMandateProfile = (caseData: Case) => {
  const bodies = getRightsBodies(caseData);
  const sourceProfile = getPlaybackSourceProfile(caseData);
  const isPlayback = sourceProfile.sourceType === 'playback';
  const hasIPRS = bodies.includes('IPRS');
  const hasPPL = bodies.includes('PPL');
  const hasNovex = bodies.includes('Novex');

  if (hasIPRS && hasPPL) {
    return {
      bodies,
      sourceType: sourceProfile.sourceType,
      label: isPlayback ? 'Composition + sound recording venue playback' : 'Composition + sound recording public venue use',
      evidenceNeed: isPlayback
        ? 'Show the song and sound recording were played back in the venue through speakers, TV, PA, DJ system, or similar source.'
        : 'Show the song composition and the commercial sound recording were used in a public or customer-facing venue setting.'
    };
  }

  if (hasPPL) {
    return {
      bodies,
      sourceType: sourceProfile.sourceType,
      label: isPlayback ? 'Sound recording venue playback / communication' : 'Sound recording public performance / communication',
      evidenceNeed: 'Show the recorded track was played to the public or customers through venue speakers, DJ systems, screens, or similar playback.'
    };
  }

  if (hasNovex) {
    return {
      bodies,
      sourceType: sourceProfile.sourceType,
      label: 'Assigned repertoire venue-license breach',
      evidenceNeed: 'Show the captured recording belongs to Novex-controlled repertoire and was used in a licensed-use venue context.'
    };
  }

  if (hasIPRS) {
    return {
      bodies,
      sourceType: sourceProfile.sourceType,
      label: isPlayback ? 'Musical work venue playback' : 'Musical work public venue use',
      evidenceNeed: isPlayback
        ? 'Show the underlying musical work was used through recorded playback in a commercial, event, hospitality, or customer-facing setting.'
        : 'Show the underlying musical or literary work was publicly used in a commercial, event, hospitality, or customer-facing setting.'
    };
  }

  return {
    bodies,
    sourceType: sourceProfile.sourceType,
    label: 'Rights-body mandate not mapped',
    evidenceNeed: 'Map the case to IPRS, PPL, Novex, or another mandate before selecting the violation posture.'
  };
};

const getLivePerformanceEvidenceProfile = (caseData: Case) => {
  const evidenceText = getEvidenceText(caseData);

  const visualSignals = [
    'visual analysis: performer',
    'performer visible',
    'singer visible',
    'musician visible',
    'artist performing',
    'live band',
    'band performing',
    'instrument on stage',
    'microphone on stage',
    'vocalist on stage'
  ];
  const snitchSignals = [
    'snitch confirmed live performance',
    'snitch observed performer',
    'snitch comment: live performance',
    'agent observed live performance',
    'field agent confirmed live performance',
    'witnessed live performance'
  ];
  const matchedVisualSignal = visualSignals.find((signal) => evidenceText.includes(signal));
  const matchedSnitchSignal = snitchSignals.find((signal) => evidenceText.includes(signal));

  if (matchedVisualSignal) {
    return {
      hasEvidence: true,
      source: 'visual analysis',
      reason: `Live performance is supported by visual evidence: ${matchedVisualSignal}.`
    };
  }

  if (matchedSnitchSignal) {
    return {
      hasEvidence: true,
      source: 'snitch comment',
      reason: `Live performance is supported by an explicit field comment: ${matchedSnitchSignal}.`
    };
  }

  return {
    hasEvidence: false,
    source: 'not established',
    reason: 'Live performance is not inferred unless visual analysis shows a performer or the snitch explicitly reports one.'
  };
};

const getPerformanceContextProfile = (caseData: Case): {
  score: number,
  grade: PerformanceContextGrade,
  raw: string,
  reason: string,
  hasUsableContext: boolean
} => {
  const raw = (caseData.absoluteProof.performanceContext || '').trim();
  const normalized = raw.toLowerCase();
  const mandateProfile = getViolationMandateProfile(caseData);
  const livePerformanceEvidence = getLivePerformanceEvidenceProfile(caseData);
  const hasVideo = Boolean(caseData.videoProofUrl || caseData.absoluteProof.smallVideoUrl || caseData.evidenceVaults.some((vault) => vault.videoUrl));
  const venueImageCount = caseData.absoluteProof.venueImages.length + caseData.evidenceVaults.reduce((sum, vault) => sum + vault.images.length, 0);
  const hasStrongPublicSignal = [
    'peak hour',
    'full capacity',
    'friday night',
    'saturday night',
    'attendance',
    'crowd',
    'public',
    'commercial',
    'dance floor',
    'bar',
    'club',
    'restaurant',
    'lounge',
    'dj',
    'pa system'
  ].some((signal) => normalized.includes(signal)) || livePerformanceEvidence.hasEvidence;
  const hasMediumSignal = [
    'venue',
    'interior',
    'capture',
    'music source',
    'patron',
    'staff'
  ].some((signal) => normalized.includes(signal));
  const hasPrivateOrWeakSignal = [
    'semi-private',
    'private',
    'corporate mixer',
    'historical record',
    'unknown',
    'missing'
  ].some((signal) => normalized.includes(signal));

  let score = 36;
  let grade: PerformanceContextGrade = 'invalid';
  let reason = `No usable context is attached for ${mandateProfile.label}.`;
  const isOnlyLiveCaptureSignal = normalized.includes('live detection') && !livePerformanceEvidence.hasEvidence;

  if (!raw || normalized === 'historical record') {
    grade = 'invalid';
    score = normalized === 'historical record' ? 40 : 34;
    reason = raw ? `Historical venue history is not proof of this violation. ${mandateProfile.evidenceNeed}` : reason;
  } else if (isOnlyLiveCaptureSignal) {
    grade = 'weak';
    score = 50;
    reason = `Live detection only confirms the case was captured or monitored live. ${livePerformanceEvidence.reason} ${mandateProfile.evidenceNeed}`;
  } else if (hasPrivateOrWeakSignal) {
    grade = 'weak';
    score = 48;
    reason = `The context points to private or limited-access use, so ${mandateProfile.label.toLowerCase()} is not established.`;
  } else if (hasStrongPublicSignal) {
    grade = 'strong';
    score = 80;
    reason = livePerformanceEvidence.hasEvidence
      ? `${livePerformanceEvidence.reason} The context also supports ${mandateProfile.label.toLowerCase()}.`
      : `The context supports ${mandateProfile.label.toLowerCase()} with venue, audience, timing, or playback-source details.`;
  } else if (hasMediumSignal) {
    grade = 'medium';
    score = 64;
    reason = `The context suggests venue use, but needs stronger audience, source, or license-scope detail for ${mandateProfile.label.toLowerCase()}.`;
  } else {
    grade = 'weak';
    score = 54;
    reason = `The context exists but does not clearly describe the rights-body violation: ${mandateProfile.evidenceNeed}`;
  }

  if (hasVideo) score += 6;
  if (venueImageCount >= 2) score += 4;
  if (caseData.trustGates.geofencingContinuity) score += 4;
  if (caseData.qualityScore >= 85) score += 3;
  if (!hasVideo) score -= 8;

  const maxByGrade: Record<PerformanceContextGrade, number> = {
    strong: 94,
    medium: 76,
    weak: 58,
    invalid: 42
  };
  const minByGrade: Record<PerformanceContextGrade, number> = {
    strong: 78,
    medium: 60,
    weak: 42,
    invalid: 30
  };

  return {
    score: Math.round(Math.min(maxByGrade[grade], Math.max(minByGrade[grade], score))),
    grade,
    raw,
    reason,
    hasUsableContext: grade === 'strong' || grade === 'medium'
  };
};

const getDecisionProfile = (caseData: Case) => {
  const trustPassCount = getTrustPassCount(caseData);
  const venueConfidence = Math.min(96, Math.max(42, 52 + caseData.pastOffences * 9 + (caseData.trustGates.geofencingContinuity ? 18 : -12)));
  const publicContext = getPerformanceContextProfile(caseData).score;
  const rightsReadiness = caseData.songAssessment.isrc && caseData.songAssessment.rightsAssociation ? 86 : 46;
  const proceduralRisk = Math.max(18, 88 - trustPassCount * 13 - (caseData.chainOfCustody.length * 3));

  if (caseData.qualityScore >= 86 && trustPassCount >= 4 && venueConfidence >= 72 && publicContext >= 60) {
    return {
      action: 'Send to Litigation',
      tone: 'green' as const,
      reason: 'Track identity, venue context, and integrity signals are strong enough for legal sufficiency review.',
      blocker: 'Confirm legal posture and selected evidence vaults.'
    };
  }

  if (caseData.qualityScore < 45 || trustPassCount <= 2) {
    return {
      action: 'Close Candidate',
      tone: 'red' as const,
      reason: 'The package has low confidence or material integrity failures that make enforcement unsafe.',
      blocker: 'Only reopen with a clean capture and stronger venue proof.'
    };
  }

  if (caseData.pastOffences > 1 || caseData.recoverableValue > 90000) {
    return {
      action: 'Assign to Agent',
      tone: 'amber' as const,
      reason: 'The case is commercially meaningful, but field-level proof gaps should be fixed before legal review.',
      blocker: 'Collect venue signage, source classification, rights-body violation context, and entrance geolocation.'
    };
  }

  return {
    action: 'Keep Monitoring',
    tone: 'purple' as const,
    reason: 'The venue remains interesting, but this submission alone is not strong enough for action.',
    blocker: 'Wait for repeat reports or a stronger capture.'
  };
};

const getBlockingQuestions = (caseData: Case) => {
  const questions: Array<{ title: string, detail: string, status: string, tone: 'green' | 'amber' | 'red' | 'blue' }> = [];
  const trustPassCount = getTrustPassCount(caseData);
  const hasVideo = Boolean(caseData.videoProofUrl || caseData.absoluteProof.smallVideoUrl || caseData.evidenceVaults.some((vault) => vault.videoUrl));
  const venueImageCount = caseData.absoluteProof.venueImages.length + caseData.evidenceVaults.reduce((sum, vault) => sum + vault.images.length, 0);
  const performanceContextProfile = getPerformanceContextProfile(caseData);

  if (!caseData.trustGates.geofencingContinuity) {
    questions.push({
      title: 'Can we trust the venue location?',
      detail: 'GPS continuity failed or is missing. Ask the agent for entrance geolocation and a clean venue boundary capture.',
      status: 'Location gap',
      tone: 'red'
    });
  }

  if (!hasVideo) {
    questions.push({
      title: 'Where is the context video?',
      detail: 'The dossier needs video showing the music source, interior setting, and public/commercial context.',
      status: 'Video missing',
      tone: 'red'
    });
  }

  if (venueImageCount < 2) {
    questions.push({
      title: 'Can we visually identify the venue?',
      detail: 'Venue signage, entrance, bill/receipt, or interior reference images are thin for identity confirmation.',
      status: 'Identity gap',
      tone: 'amber'
    });
  }

  if (!performanceContextProfile.hasUsableContext) {
    const mandateProfile = getViolationMandateProfile(caseData);
    questions.push({
      title: 'Is the violation context provable?',
      detail: `${performanceContextProfile.raw || 'No context supplied'}. ${performanceContextProfile.reason} ${mandateProfile.evidenceNeed}`,
      status: performanceContextProfile.grade === 'invalid' ? 'Context gap' : 'Weak context',
      tone: performanceContextProfile.grade === 'invalid' ? 'red' : 'amber'
    });
  }

  if (!isTrackIdentified(caseData)) {
    questions.push({
      title: 'Is the track match strong enough?',
      detail: 'No track has been identified yet. Review the main audio and separated stems before escalation.',
      status: 'Audio review',
      tone: 'red'
    });
  }

  if (!caseData.songAssessment.isrc || !caseData.songAssessment.rightsAssociation) {
    questions.push({
      title: 'Can rights be asserted?',
      detail: 'ISRC or rights association data is incomplete, so legal review should confirm ownership before notice/recovery.',
      status: 'Rights gap',
      tone: 'amber'
    });
  }

  if (trustPassCount < 4) {
    questions.push({
      title: 'Is the packet defensible?',
      detail: `${trustPassCount}/5 trust gates passed. Review hash, signature, clock skew, geofence, and device trust before action.`,
      status: 'Custody risk',
      tone: trustPassCount <= 2 ? 'red' : 'amber'
    });
  }

  if (questions.length === 0) {
    questions.push({
      title: 'Which evidence vault should carry the action?',
      detail: 'Signals are strong. Select the vaults that best show track proof, venue identity, public use, and chain of custody.',
      status: 'Action ready',
      tone: 'green'
    });
  }

  return questions.slice(0, 4);
};

// Replaces the old ScoreBar wherever the underlying fact is real but discrete (a
// status, a label, a count) rather than a continuous measurement. Same visual
// slot, no percentage bar, no synthesized number.
function FactBadge({ label, value, tone, detail }: { label: string, value: string, tone: 'green' | 'amber' | 'red' | 'blue', detail?: string }) {
  const toneText = { green: 'text-emerald-300', amber: 'text-amber-300', red: 'text-red-300', blue: 'text-blue-300' };
  const toneBorder = {
    green: 'border-emerald-500/30 bg-emerald-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
    red: 'border-red-500/30 bg-red-500/5',
    blue: 'border-blue-500/30 bg-blue-500/5'
  };
  return (
    <div className={cn("rounded-lg border p-3", toneBorder[tone])}>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className={cn("mt-2 text-sm font-black", toneText[tone])}>{value}</p>
      {detail && <p className="mt-1 text-[10px] font-medium leading-4 text-slate-500">{detail}</p>}
    </div>
  );
}

type SignalEvidenceLayer = {
  layer: string;
  status: 'verified' | 'usable' | 'advisory' | 'blocked' | 'pending';
  kind: string;
  contribution: string;
  affectsForensicScore: boolean;
  provenance: string;
  storedAs: string;
  evidence: string[];
  icon: React.ReactNode;
};

type EvidenceAsset = {
  id: string;
  label: string;
  kind: 'video' | 'image' | 'audio' | 'data';
  url?: string;
  detail: string;
};

const signalStatusClasses: Record<SignalEvidenceLayer['status'], string> = {
  verified: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100',
  usable: 'border-sky-400/40 bg-sky-400/10 text-sky-100',
  advisory: 'border-amber-400/40 bg-amber-400/10 text-amber-100',
  blocked: 'border-red-400/40 bg-red-400/10 text-red-100',
  pending: 'border-slate-400/40 bg-slate-400/10 text-slate-100'
};

const formatMeters = (value?: number | null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'n/a';
  return `${Math.round(numeric)} m`;
};

const toFiniteNumbers = (values: unknown[]) => (
  values
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map(Number)
    .filter(Number.isFinite)
);

const humanizeToken = (value?: string | null) => (
  String(value || 'unknown').replace(/_/g, ' ')
);

const getVenueAttributionSignal = (caseData: Case): SignalEvidenceLayer => {
  const attribution = caseData.venueAttribution || null;
  const locationDelta = caseData.locationDelta || {};
  const selectedStart = attribution?.selectedVenueDistanceStartMeters ?? locationDelta.selectedVenueDistanceStartMeters ?? null;
  const selectedEnd = attribution?.selectedVenueDistanceEndMeters ?? locationDelta.selectedVenueDistanceEndMeters ?? null;
  const selectedDeltas = toFiniteNumbers([selectedStart, selectedEnd]);
  const selectedMin = selectedDeltas.length ? Math.min(...selectedDeltas) : null;
  const matchedStart = attribution?.matchedVenueDistanceStartMeters ?? locationDelta.matchedVenueDistanceStartMeters ?? null;
  const matchedEnd = attribution?.matchedVenueDistanceEndMeters ?? locationDelta.matchedVenueDistanceEndMeters ?? null;
  const envelope = attribution?.accuracyEnvelopeMeters ?? locationDelta.accuracyEnvelopeMeters ?? null;
  const visualSource = attribution?.visualSource || attribution?.actualSource || null;
  const statusText = String(attribution?.status || '').toLowerCase();
  const legalBlock = Boolean(attribution?.legalBlock);
  // Status comes straight from the backend's honest token (supported_by_visual_
  // signage / plausible_supported / adjacent_mismatch / unresolved / plausible)
  // — no numeric threshold, no fabricated score. Unknown/absent -> pending.
  const status: SignalEvidenceLayer['status'] = legalBlock
    ? 'blocked'
    : statusText.includes('supported')
      ? 'verified'
      : statusText.includes('plausible')
        ? 'usable'
        : statusText.includes('unresolved') || statusText.includes('adjacent') || statusText.includes('mismatch')
          ? 'advisory'
          : 'pending';

  return {
    layer: 'Venue attribution',
    icon: <MapPin className="h-5 w-5" />,
    status,
    affectsForensicScore: true,
    kind: 'Coordinate + visual signal',
    contribution: 'Critical',
    provenance: attribution?.note
      || `Selected venue delta ${formatMeters(selectedMin)}; matched venue delta start ${formatMeters(matchedStart)} / end ${formatMeters(matchedEnd)}; accuracy envelope ${formatMeters(envelope)}. AI-assisted visual source: ${visualSource || 'not named'}.`,
    storedAs: 'venue_attribution + location_delta',
    evidence: [
      'selected_venue_delta',
      'matched_venue_delta',
      'accuracy_envelope',
      'visual_context'
    ]
  };
};

const detectSourceContext = (caseData: Case) => {
  const sourceClass = caseData.signalSummary?.sourceClass || caseData.sourceAssessment?.sourceClass || null;
  const sourceConfidence = Number(caseData.signalSummary?.sourceConfidence ?? caseData.sourceAssessment?.confidence ?? NaN);
  const confidenceText = Number.isFinite(sourceConfidence) ? ` (${Math.round(sourceConfidence * 100)}% confidence)` : '';
  const classifierText = caseData.signalSummary?.classifierMode || caseData.sourceAssessment?.classifierMode || caseData.sourceAssessment?.requestedMode || 'source classifier';
  const evidenceText = getEvidenceText(caseData);
  const compactVenueCue = /\bcafe\b|\bcoffee\b|\bsmall speaker\b|\bcompact\b|\bbluetooth speaker\b|\bportable speaker\b|\bwall-mounted\b|\bshelf-mounted\b|\bcorner-mounted\b/i.test(evidenceText);

  if (sourceClass === 'likely_pa_system') {
    return {
      status: 'usable' as const,
      label: compactVenueCue ? 'small venue speaker likely' : 'venue PA playback likely',
      provenance: compactVenueCue
        ? `${classifierText} classified this as room/venue playback${confidenceText}; venue context suggests a compact cafe speaker rather than a large PA.`
        : `${classifierText} classified the audio as likely installed/room playback${confidenceText}.`
    };
  }

  if (sourceClass === 'likely_small_speaker' || sourceClass === 'likely_personal_device') {
    return {
      status: 'advisory' as const,
      label: sourceClass === 'likely_personal_device' ? 'personal-device playback risk' : 'small-speaker playback risk',
      provenance: `${classifierText} detected small/near-field playback characteristics${confidenceText}. This needs visual or field confirmation.`
    };
  }

  const text = evidenceText;
  const hasVenuePlayback = /\bpa system\b|\bvenue-wide\b|\bspeaker|\blarge tv\b|\bsound system\b|\bdj booth\b|\broom playback\b|\bmusic video\b|\bplayback\b/.test(text);
  const hasPersonalPlayback = /\blaptop\b|\bphone\b|\bearbuds?\b|\bheadphones?\b|\bpersonal device\b|\bportable speaker\b/.test(text);
  const hasLimit = /\binconclusive\b|\bunavailable\b|\bno installed\b|\bnot clearly visible\b|\bmotion blur\b|\blimited view\b|\bobstruction\b/.test(text);

  if (hasVenuePlayback) {
    return {
      status: 'usable' as const,
      label: 'venue playback',
      provenance: 'Evidence text points to recorded playback through a venue speaker, PA, TV, DJ, or room playback source.'
    };
  }

  if (hasPersonalPlayback) {
    return {
      status: 'advisory' as const,
      label: 'personal or small-device playback',
      provenance: 'Evidence text points to laptop, phone, earbuds, portable speaker, or another small-device source. This needs source confirmation.'
    };
  }

  return {
    status: sourceClass === 'inconclusive' || hasLimit ? 'pending' as const : 'advisory' as const,
    label: 'source inconclusive',
    provenance: sourceClass === 'inconclusive'
      ? `${classifierText} could not reliably classify venue playback versus personal-device/live source${confidenceText}.`
      : 'The package does not clearly classify whether audio came from venue playback, a personal device, or a live performer.'
  };
};

const getCaseEvidenceAssets = (caseData: Case): EvidenceAsset[] => {
  const assets: EvidenceAsset[] = [];
  const seen = new Set<string>();
  const addAsset = (asset: EvidenceAsset) => {
    const key = `${asset.kind}:${asset.url || asset.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    assets.push(asset);
  };

  if (caseData.videoProofUrl) {
    addAsset({ id: `${caseData.id}:raw-video`, label: 'Raw video', kind: 'video', url: caseData.videoProofUrl, detail: 'Captured media asset' });
  }
  if (caseData.absoluteProof.smallVideoUrl) {
    addAsset({ id: `${caseData.id}:review-video`, label: 'Review video', kind: 'video', url: caseData.absoluteProof.smallVideoUrl, detail: 'Authority review media' });
  }
  caseData.absoluteProof.venueImages.forEach((url, index) => {
    addAsset({ id: `${caseData.id}:frame:${index}`, label: `Peak frame ${index + 1}`, kind: 'image', url, detail: 'Visual enrichment frame' });
  });
  caseData.evidenceVaults.forEach((vault) => {
    if (vault.videoUrl) {
      addAsset({ id: `${vault.id}:video`, label: `${vault.name} video`, kind: 'video', url: vault.videoUrl, detail: format(vault.timestamp, 'MMM d, HH:mm') });
    }
    vault.images.forEach((url, index) => {
      addAsset({ id: `${vault.id}:image:${index}`, label: `${vault.name} image ${index + 1}`, kind: 'image', url, detail: 'Vault image asset' });
    });
  });
  (caseData.audioDeconstruction?.artifacts || []).forEach((artifact) => {
    addAsset({
      id: artifact.assetId,
      label: `${formatStemLabel(artifact.stem)} stem`,
      kind: 'audio',
      url: artifact.url,
      detail: `${artifact.mimeType || 'audio'}${artifact.sizeBytes ? ` - ${(artifact.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}`
    });
  });

  return assets;
};

const buildSignalEvidenceLayers = (caseData: Case): SignalEvidenceLayer[] => {
  const trustPassCount = getTrustPassCount(caseData);
  const sourceContext = detectSourceContext(caseData);
  const assets = getCaseEvidenceAssets(caseData);
  const imageCount = assets.filter((asset) => asset.kind === 'image').length;
  const videoCount = assets.filter((asset) => asset.kind === 'video').length;
  const hasTrack = Boolean(caseData.songAssessment.title && caseData.songAssessment.title !== 'Unknown Track');
  const hasIsrc = Boolean(caseData.songAssessment.isrc && caseData.songAssessment.isrc !== 'Unavailable');
  const demucsComplete = caseData.audioDeconstruction?.status === 'completed';
  const rightsKnown = Boolean(caseData.songAssessment.rightsAssociation && caseData.songAssessment.rightsAssociation !== 'Rights Context Pending');

  return [
    {
      layer: 'Media integrity',
      icon: <ShieldCheck className="h-5 w-5" />,
      status: caseData.trustGates.mediaHashKey && caseData.trustGates.payloadSignature ? 'verified' : videoCount ? 'usable' : 'blocked',
      affectsForensicScore: true,
      kind: 'Hard fact',
      contribution: 'Critical',
      provenance: `${videoCount} video asset(s). Media hash ${caseData.trustGates.mediaHashKey ? 'present' : 'missing'}; payload signature ${caseData.trustGates.payloadSignature ? 'verified' : 'not verified'}; clock skew ${caseData.trustGates.clockSkewDetection ? 'passed' : 'open'}.`,
      storedAs: 'assets + media_integrity_checks',
      evidence: ['raw_video_asset', 'media_hash_gate', 'payload_signature', 'clock_skew_gate']
    },
    {
      layer: 'Device presence proof',
      icon: <MapPin className="h-5 w-5" />,
      status: caseData.trustGates.geofencingContinuity ? 'verified' : 'advisory',
      affectsForensicScore: true,
      kind: 'Captured fact',
      contribution: 'Critical',
      provenance: `Capture coordinate is tied to ${caseData.location.name}, ${caseData.location.city}. This proves device presence near the venue, not source venue by itself.`,
      storedAs: 'gps_points + venue_matches',
      evidence: ['venue_coordinate', 'geofence_gate', 'device_trust_band']
    },
    getVenueAttributionSignal(caseData),
    {
      layer: 'Audio identity',
      icon: <Fingerprint className="h-5 w-5" />,
      status: hasTrack ? 'verified' : 'blocked',
      affectsForensicScore: true,
      kind: 'External fact',
      contribution: 'Critical',
      provenance: hasTrack ? `${caseData.songAssessment.title} by ${caseData.songAssessment.artists.join(', ')} is attached. ${demucsComplete ? 'Demucs stems are available.' : 'Stem deconstruction is absent or incomplete.'}` : 'No resolved song identity is attached.',
      storedAs: 'audio_identifications',
      evidence: ['derived_audio', 'fingerprint_attempts', 'song_identity', 'stem_artifacts']
    },
    {
      layer: 'Source context',
      icon: <Activity className="h-5 w-5" />,
      status: sourceContext.status,
      affectsForensicScore: true,
      kind: 'Advisory heuristic',
      contribution: 'Corroborating',
      provenance: `${sourceContext.label}: ${sourceContext.provenance} This is not standalone legal proof.`,
      storedAs: 'source_assessments',
      evidence: ['source_class', 'venue_playback_cues', 'visual_enrichment', 'analyst_note']
    },
    {
      layer: 'Visual enrichment',
      icon: <Video className="h-5 w-5" />,
      status: imageCount ? 'advisory' : 'pending',
      affectsForensicScore: true,
      kind: 'Enrichment factor',
      contribution: 'Modifier',
      provenance: imageCount ? `${imageCount} frame/image asset(s) enrich venue identity and source context. Visual output remains advisory and must not be treated as standalone proof.` : 'No visual frame assets are attached.',
      storedAs: 'visual_assessments',
      evidence: ['key_frames', 'venue_identity_cues', 'playback_equipment_cues', 'obstruction_flags']
    },
    {
      layer: 'Business and rights gate',
      icon: <Gavel className="h-5 w-5" />,
      status: rightsKnown ? 'usable' : 'pending',
      affectsForensicScore: false,
      kind: 'Partner data required',
      contribution: 'Business gate',
      provenance: rightsKnown ? `Rights context is ${caseData.songAssessment.rightsAssociation}. License status still requires IPRS/PPL/Novex partnership data or verified license artifacts.` : 'Rights context is pending because partner rights/license data is not connected yet. This is expected for now and is excluded from the forensic score.',
      storedAs: 'merchant_master + license_status',
      evidence: ['rights_association', 'merchant_record', 'tariff_match', 'license_status']
    }
  ];
};

function StatusPill({ status }: { status: SignalEvidenceLayer['status'] }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-black uppercase tracking-widest", signalStatusClasses[status])}>
      {status === 'verified' || status === 'usable' ? <CheckCircle2 className="h-3 w-3" /> : status === 'blocked' ? <X className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

function PanelState({ type, message }: { type: 'loading' | 'empty' | 'error'; message: string }) {
  const Icon = type === 'error' ? AlertCircle : type === 'empty' ? Inbox : Clock;
  return (
    <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-5 text-sm font-bold text-slate-500">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4" />
        {message}
      </div>
    </div>
  );
}

function RepeatCaptureSummaryPanel({ caseData, venueCases }: { caseData: Case; venueCases: Case[] }) {
  const summary = getRepeatSummary(caseData, venueCases);
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Repeat-capture summary</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        {[
          ['Confirmed incidents', summary.confirmedIncidentCount],
          ['Capture dates', summary.distinctCaptureDates],
          ['Detected songs', summary.distinctDetectedSongs],
          ['First detected', summary.firstDetectedAt ? formatOptionalDateTime(summary.firstDetectedAt) : 'None'],
          ['Latest detected', summary.latestDetectedAt ? formatOptionalDateTime(summary.latestDetectedAt) : 'None']
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">{label}</p>
            <p className="mt-1 text-sm font-black text-white">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function IncidentTimelinePanel({ caseData, venueCases, onOpenCapture }: { caseData: Case; venueCases: Case[]; onOpenCapture: (id: string) => void }) {
  const timeline = getIncidentTimeline(caseData, venueCases);
  if (!timeline.length) return <PanelState type="empty" message="No incident history exists for this venue." />;

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Venue incident timeline</p>
      <div className="mt-5 space-y-3">
        {timeline.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpenCapture(entry.id)}
            className="grid w-full grid-cols-[24px_minmax(0,1fr)_auto] gap-4 rounded-md border border-slate-800 bg-slate-950/60 p-4 text-left transition-colors hover:border-blue-500/30 hover:bg-blue-500/10"
          >
            <div className="flex flex-col items-center gap-2">
              <div className={cn("h-3 w-3 rounded-full", index === timeline.length - 1 ? "bg-emerald-400" : "bg-slate-600")} />
              <div className="h-full w-px bg-slate-800" />
            </div>
            <div>
              <p className="text-sm font-black text-white">{entry.detectedSong}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{formatOptionalDateTime(entry.capturedAt)} · {entry.sourceLocation}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-md border border-slate-700 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{entry.status}</span>
                <span className="rounded-md border border-slate-700 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{entry.evidenceConfidence}% confidence</span>
                <span className={cn(
                  "rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                  entry.hasForensicArtifacts ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/30 text-amber-300"
                )}>
                  {entry.hasForensicArtifacts ? 'Artifacts ready' : 'Artifacts pending'}
                </span>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-500" />
          </button>
        ))}
      </div>
    </section>
  );
}

function VenueIdentityBadge({ workflow }: { workflow: EnforcementWorkflowState }) {
  const venue = workflow.venueIdentity;
  if (!venue) return null;
  const blocking = venue.status !== 'RESOLVED';
  return (
    <span className={cn(
      "rounded-md border px-2 py-1 font-mono text-[10px] font-black uppercase tracking-widest",
      venue.status === 'RESOLVED'
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : venue.status === 'APPROXIMATE'
          ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
          : "border-red-500/30 bg-red-500/10 text-red-300"
    )}>
      Venue {blocking ? venue.displayLabel : venueIdentityLabels[venue.status]}
    </span>
  );
}

function EvidenceAssetRail({ caseData }: { caseData: Case }) {
  const assets = getCaseEvidenceAssets(caseData);

  if (!assets.length) {
    return (
      <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/50 p-4 text-sm font-medium text-slate-500">
        No assets are attached to this evidence package.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset) => (
        <div key={asset.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/70">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-white">{asset.label}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">{asset.kind} - {asset.detail}</p>
            </div>
            {asset.url && (
              <a href={asset.url} target="_blank" rel="noreferrer" className="shrink-0 text-slate-500 hover:text-blue-300" title={`Open ${asset.label}`}>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
          {asset.kind === 'image' && asset.url ? (
            <img src={asset.url} alt={asset.label} className="aspect-video w-full object-cover" />
          ) : asset.kind === 'video' && asset.url ? (
            <video src={asset.url} controls preload="metadata" className="aspect-video w-full bg-black object-contain" />
          ) : asset.kind === 'audio' && asset.url ? (
            <div className="p-3">
              <audio controls preload="none" className="w-full">
                <source src={asset.url} />
              </audio>
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center text-xs font-bold uppercase tracking-widest text-slate-600">
              Data asset
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function DemucsEvaluationPanel({ caseData }: { caseData: Case }) {
  const deconstruction = caseData.audioDeconstruction;
  const artifacts = [...(deconstruction?.artifacts || [])].sort((left, right) => getStemPriority(left.stem) - getStemPriority(right.stem));

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Demucs evaluation</p>
          <h4 className="mt-2 text-lg font-black text-white">{deconstruction?.status === 'completed' ? 'Stem isolation attached' : 'Stem isolation pending'}</h4>
          <p className="mt-2 max-w-3xl text-xs font-medium leading-5 text-slate-400">
            {deconstruction?.summary || 'No Demucs summary is attached to this case yet.'}
          </p>
        </div>
        <StatusPill status={deconstruction?.status === 'completed' ? 'verified' : deconstruction?.status === 'failed' ? 'blocked' : 'pending'} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          ['Provider', deconstruction?.provider || 'n/a'],
          ['Model', deconstruction?.model || 'n/a'],
          ['Preferred stem', formatStemLabel(deconstruction?.preferredStem)],
          ['Artifacts', artifacts.length]
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">{label}</p>
            <p className="mt-1 truncate text-sm font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      {artifacts.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {artifacts.map((artifact) => (
            <div key={artifact.assetId} className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-white">{formatStemLabel(artifact.stem)}</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">{artifact.mimeType || 'audio'}{artifact.sizeBytes ? ` - ${(artifact.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}</p>
                </div>
                <a href={artifact.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-300" title={`Open ${formatStemLabel(artifact.stem)}`}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <audio controls preload="none" className="w-full">
                <source src={artifact.url} type={artifact.mimeType || 'audio/wav'} />
              </audio>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Deterministic verdict over real statuses only — no numeric average, no
// invented threshold. 'blocked' on any scored layer always wins (a hard
// integrity failure outranks everything); otherwise the verdict reflects the
// least-confirmed real status present.
const getEvidenceVerdict = (layers: SignalEvidenceLayer[]): { label: string, tone: 'green' | 'amber' | 'red' } => {
  const scored = layers.filter((layer) => layer.affectsForensicScore);
  if (scored.some((layer) => layer.status === 'blocked')) return { label: 'Blocked', tone: 'red' };
  if (scored.every((layer) => layer.status === 'verified')) return { label: 'Fully verified', tone: 'green' };
  if (scored.some((layer) => layer.status === 'pending')) return { label: 'Pending signals', tone: 'amber' };
  return { label: 'Usable / advisory', tone: 'amber' };
};

function EvidenceStatusTally({ layers }: { layers: SignalEvidenceLayer[] }) {
  const scoredLayers = layers.filter((layer) => layer.affectsForensicScore);
  const excludedLayers = layers.filter((layer) => !layer.affectsForensicScore);
  const counts = scoredLayers.reduce((acc, layer) => {
    acc[layer.status] = (acc[layer.status] || 0) + 1;
    return acc;
  }, {} as Record<SignalEvidenceLayer['status'], number>);
  const statusOrder: SignalEvidenceLayer['status'][] = ['verified', 'usable', 'advisory', 'pending', 'blocked'];

  return (
    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Evidence status tally</p>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-300">
            Each layer's real status, counted as-is — no averaging, no synthetic score. Business and rights gates are tracked separately.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusOrder.filter((s) => counts[s]).map((s) => (
            <span key={s} className="rounded-md border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-300">
              {counts[s]} {s}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-md border border-slate-800">
        {scoredLayers.map((layer) => (
          <div key={layer.layer} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-800 px-3 py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-white">{layer.layer}</p>
              <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">{layer.kind}</p>
            </div>
            <StatusPill status={layer.status} />
          </div>
        ))}
      </div>
      {excludedLayers.length > 0 && (
        <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-purple-300">
          Tracked separately (business gate, not a forensic signal): {excludedLayers.map((layer) => layer.layer).join(', ')}
        </p>
      )}
    </div>
  );
}

function SignalEvidencePanel({ caseData, compact = false }: { caseData: Case, compact?: boolean }) {
  const layers = buildSignalEvidenceLayers(caseData);
  const verdict = getEvidenceVerdict(layers);
  const visibleLayers = compact ? layers.slice(0, 4) : layers;

  return (
    <section className={cn("rounded-lg border border-slate-800 bg-slate-950/70", compact ? "p-3" : "p-5")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">Signal evidence</p>
          <h3 className={cn("mt-2 font-black tracking-tight text-white", compact ? "text-base" : "text-2xl")}>Facts, assets, advisory signals</h3>
          <p className="mt-2 max-w-4xl text-xs font-medium leading-5 text-slate-400">
            Evidence is split into signed facts, extracted assets, advisory source/visual signals, Demucs output, and rights gates. Rights are shown as a business gate, tracked separately from the evidence verdict.
          </p>
        </div>
        <div className={cn(
          "rounded-lg border px-4 py-3 text-right",
          verdict.tone === 'green' ? "border-emerald-500/30 bg-emerald-500/10" : verdict.tone === 'red' ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"
        )}>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Evidence verdict</p>
          <p className={cn("mt-1 text-lg font-black", verdict.tone === 'green' ? "text-emerald-300" : verdict.tone === 'red' ? "text-red-300" : "text-amber-300")}>{verdict.label}</p>
        </div>
      </div>

      <div className={cn("mt-4 grid gap-3", compact ? "grid-cols-1" : "xl:grid-cols-2")}>
        {visibleLayers.map((layer) => (
          <div key={layer.layer} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-slate-300">
                {layer.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-white">{layer.layer}</p>
                  <StatusPill status={layer.status} />
                  <span className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{layer.kind}</span>
                  {!layer.affectsForensicScore && (
                    <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-purple-200">business gate</span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{layer.provenance}</p>
                {!compact && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {layer.evidence.map((item) => (
                      <span key={item} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 font-mono text-[10px] text-slate-400">{item}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-20 shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{layer.contribution}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!compact && (
        <div className="mt-4 space-y-4">
          <EvidenceStatusTally layers={layers} />
          <DemucsEvaluationPanel caseData={caseData} />
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Attached assets</p>
            <EvidenceAssetRail caseData={caseData} />
          </div>
        </div>
      )}
    </section>
  );
}

const getWaveSeed = (input: string) => (
  input.split('').reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 3), 0)
);

const getWavePath = (seedInput: string, amplitude = 1, peakStart = 58, peakWidth = 18) => {
  const seed = getWaveSeed(seedInput);
  const points = 72;
  return Array.from({ length: points }).map((_, index) => {
    const x = (index / (points - 1)) * 100;
    const inPeak = x >= peakStart && x <= peakStart + peakWidth;
    const peakLift = inPeak ? 1.65 : 0.55;
    const primary = Math.sin((index + seed) * 0.42) * 7.5 * amplitude * peakLift;
    const secondary = Math.sin((index * 0.17) + (seed % 11)) * 4.5 * amplitude * peakLift;
    const transient = Math.sin((index * 1.13) + (seed % 7)) * 2.5 * amplitude * peakLift;
    const y = Math.min(33, Math.max(3, 18 + primary + secondary + transient));
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
};

// ── Real audio waveforms (the Demucs USP) ──────────────────────────────────
// Decode an actual audio file (raw scene audio or an isolated stem) served at
// /media, downsample to a peak envelope, and turn it into the same SVG-path
// space WaveformLane already renders. Falls back to the synthetic getWavePath
// when decode fails (e.g. cross-origin without CORS) so the lane is never empty.
const WAVEFORM_BUCKETS = 96;

let sharedAudioContext: AudioContext | null = null;
const getSharedAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    sharedAudioContext = Ctor ? new Ctor() : null;
  }
  return sharedAudioContext;
};

const useAudioPeaks = (url: string | null | undefined) => {
  const [state, setState] = useState<{ peaks: number[] | null; loading: boolean; error: boolean }>(
    { peaks: null, loading: false, error: false }
  );
  useEffect(() => {
    if (!url) { setState({ peaks: null, loading: false, error: false }); return; }
    let cancelled = false;
    setState({ peaks: null, loading: true, error: false });
    (async () => {
      try {
        const ctx = getSharedAudioContext();
        if (!ctx) throw new Error('no AudioContext');
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`fetch ${resp.status}`);
        const raw = await resp.arrayBuffer();
        const audio = await ctx.decodeAudioData(raw);
        const data = audio.getChannelData(0);
        const block = Math.floor(data.length / WAVEFORM_BUCKETS) || 1;
        const peaks: number[] = [];
        for (let i = 0; i < WAVEFORM_BUCKETS; i += 1) {
          let max = 0;
          const start = i * block;
          for (let j = 0; j < block; j += 1) {
            const v = Math.abs(data[start + j] || 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        const ceil = Math.max(...peaks, 0.0001);
        const normalized = peaks.map((p) => p / ceil);
        if (!cancelled) setState({ peaks: normalized, loading: false, error: false });
      } catch {
        if (!cancelled) setState({ peaks: null, loading: false, error: true });
      }
    })();
    return () => { cancelled = true; };
  }, [url]);
  return state;
};

// Peak envelope (0..1 per bucket) → top-envelope SVG path in the 0..100 x,
// 3..33 y space WaveformLane fills under.
const peaksToWavePath = (peaks: number[]) => {
  const n = peaks.length;
  if (n < 2) return '';
  return peaks.map((p, index) => {
    const x = (index / (n - 1)) * 100;
    const y = Math.min(33, Math.max(3, 18 - p * 15));
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
};

// Loudest sustained window in the real envelope → the highlighted peak region,
// so "Peak X%-Y%" marks where the song actually peaks, not a seeded guess.
const computePeakRegion = (peaks: number[], widthPct = 16) => {
  const n = peaks.length;
  const w = Math.max(2, Math.round((widthPct / 100) * n));
  let bestStart = 0;
  let bestSum = -1;
  for (let i = 0; i + w <= n; i += 1) {
    let sum = 0;
    for (let j = i; j < i + w; j += 1) sum += peaks[j];
    if (sum > bestSum) { bestSum = sum; bestStart = i; }
  }
  return { peakStart: (bestStart / (n - 1)) * 100, peakWidth: (w / (n - 1)) * 100 };
};

function WaveformLane({
  label,
  detail,
  path,
  color,
  muted = false,
  peakStart = 58,
  peakWidth = 18,
  progressPercent = 0
}: {
  label: string,
  detail: string,
  path: string,
  color: string,
  muted?: boolean,
  peakStart?: number,
  peakWidth?: number,
  progressPercent?: number
}) {
  const safeLabel = label.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const clipId = `peak-${safeLabel}-${Math.round(peakStart)}-${Math.round(peakWidth)}`;
  const progressClipId = `progress-${safeLabel}-${Math.round(peakStart)}-${Math.round(peakWidth)}`;
  const progressX = Math.max(0, Math.min(100, progressPercent));

  return (
    <div className={cn(
      "grid min-w-0 grid-cols-[104px_minmax(0,1fr)] gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 max-md:grid-cols-1",
      muted && "opacity-60"
    )}>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-black uppercase tracking-widest text-white">{label}</p>
        <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-widest text-slate-500">{detail}</p>
      </div>
      <div className="relative min-w-0 overflow-hidden rounded-md border border-slate-800 bg-black/40 px-3 py-2">
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" className="h-10 w-full">
          <defs>
            <clipPath id={clipId}>
              <rect x={peakStart} y="0" width={peakWidth} height="36" />
            </clipPath>
            <clipPath id={progressClipId}>
              <rect x="0" y="0" width={progressX} height="36" />
            </clipPath>
          </defs>
          <line x1="0" y1="18" x2="100" y2="18" stroke="rgba(148, 163, 184, 0.18)" strokeWidth="0.4" />
          {[20, 40, 60, 80].map((tick) => (
            <line key={tick} x1={tick} y1="3" x2={tick} y2="33" stroke="rgba(148, 163, 184, 0.10)" strokeWidth="0.35" />
          ))}
          <rect x={peakStart} y="2" width={peakWidth} height="32" fill={color} opacity="0.07" rx="2" />
          <path d={path} fill="none" stroke="rgba(148, 163, 184, 0.32)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          <path d={`${path} L 100 36 L 0 36 Z`} fill="rgba(148, 163, 184, 0.12)" />
          <path d={path} fill="none" stroke="rgba(226, 232, 240, 0.48)" strokeWidth="1.7" vectorEffect="non-scaling-stroke" clipPath={`url(#${progressClipId})`} />
          <path d={path} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" clipPath={`url(#${clipId})`} />
          <path d={`${path} L 100 36 L 0 36 Z`} fill={color} opacity="0.18" clipPath={`url(#${clipId})`} />
          <line x1={progressX} y1="2" x2={progressX} y2="34" stroke="white" strokeWidth="0.9" opacity={progressX > 0 ? 0.85 : 0} vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-1 flex justify-between text-[9px] font-bold text-slate-600">
          <span>0s</span>
          <span>10s</span>
          <span>20s</span>
        </div>
      </div>
    </div>
  );
}

function EvidenceMediaDossier({ caseData }: { caseData: Case }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isolatedAudioRef = useRef<HTMLAudioElement | null>(null);
  const [audioMode, setAudioMode] = useState<'raw' | 'isolated'>('raw');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const primaryVault = caseData.evidenceVaults.find((vault) => vault.videoUrl) || caseData.evidenceVaults[0];
  const videoUrl = primaryVault?.videoUrl || caseData.videoProofUrl || caseData.absoluteProof.smallVideoUrl;
  const artifacts = [...(caseData.audioDeconstruction?.artifacts || [])].sort((left, right) => (
    getStemPriority(left.stem) - getStemPriority(right.stem)
  ));
  const isolatedMusic = artifacts.find((artifact) => artifact.stem === 'music')
    || artifacts.find((artifact) => artifact.stem === caseData.audioDeconstruction?.preferredStem)
    || artifacts.find((artifact) => artifact.stem === caseData.audioDeconstruction?.fingerprintStem)
    || artifacts.find((artifact) => artifact.stem === 'other')
    || null;
  // Real audio for the waveforms: the 'raw' artifact is the full extracted scene
  // audio; isolatedMusic is the chosen stem. Decode both client-side.
  const rawArtifact = artifacts.find((artifact) => artifact.stem === 'raw') || null;
  const rawPeaks = useAudioPeaks(rawArtifact?.url);
  const musicPeaks = useAudioPeaks(isolatedMusic?.url);
  // Peak region from the real envelope (raw preferred, else the stem). Falls
  // back to the seeded position only while decoding / if decode fails.
  const realPeakSource = rawPeaks.peaks || musicPeaks.peaks;
  const realRegion = realPeakSource ? computePeakRegion(realPeakSource) : null;
  const peakStart = realRegion ? realRegion.peakStart : 58 + (getWaveSeed(caseData.id) % 8);
  const peakWidth = realRegion ? realRegion.peakWidth : 16;
  const rawWavePath = rawPeaks.peaks ? peaksToWavePath(rawPeaks.peaks) : getWavePath(`${caseData.id}:raw`, 1, peakStart, peakWidth);
  const musicWavePath = musicPeaks.peaks
    ? peaksToWavePath(musicPeaks.peaks)
    : getWavePath(`${caseData.id}:isolated-music`, 0.96, peakStart, peakWidth);
  const rawWaveReal = Boolean(rawPeaks.peaks);
  const musicWaveReal = Boolean(musicPeaks.peaks);

  useEffect(() => {
    setPlaybackProgress(0);
  }, [caseData.id, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (audioMode === 'isolated') {
      video.muted = true;
      return;
    }

    video.muted = false;
    isolatedAudioRef.current?.pause();
  }, [audioMode, videoUrl]);

  const syncIsolatedAudio = () => {
    if (!videoRef.current || !isolatedAudioRef.current) return;
    isolatedAudioRef.current.currentTime = Math.min(
      videoRef.current.currentTime,
      Number.isFinite(isolatedAudioRef.current.duration) ? Math.max(0, isolatedAudioRef.current.duration - 0.1) : videoRef.current.currentTime
    );
  };

  const handleVideoPlay = () => {
    if (audioMode !== 'isolated' || !isolatedAudioRef.current) return;
    syncIsolatedAudio();
    isolatedAudioRef.current.play().catch(() => undefined);
  };

  const handleVideoPause = () => {
    isolatedAudioRef.current?.pause();
  };

  const handleSeek = () => {
    if (audioMode === 'isolated') syncIsolatedAudio();
    const video = videoRef.current;
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      setPlaybackProgress((video.currentTime / video.duration) * 100);
    }
  };

  const switchAudioMode = (mode: 'raw' | 'isolated') => {
    setAudioMode(mode);
    if (mode === 'isolated') {
      if (videoRef.current) {
        videoRef.current.muted = true;
      }
      syncIsolatedAudio();
      if (videoRef.current && !videoRef.current.paused) {
        isolatedAudioRef.current?.play().catch(() => undefined);
      }
    } else {
      if (videoRef.current) {
        videoRef.current.muted = false;
      }
      isolatedAudioRef.current?.pause();
    }
  };

  return (
    <section className="mt-5 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Evidence media dossier</p>
          <h4 className="mt-2 text-lg font-black text-white">Video and audio timeline</h4>
        </div>
        <span className={cn(
          "rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest",
          caseData.audioDeconstruction?.status === 'completed'
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-300"
        )}>
          {caseData.audioDeconstruction?.status === 'completed' ? 'Stems attached' : 'Stems pending'}
        </span>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-black">
          {videoUrl ? (
            <div className="aspect-video max-h-[360px] w-full bg-black">
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                preload="metadata"
                muted={audioMode === 'isolated'}
                onPlay={handleVideoPlay}
                onPause={handleVideoPause}
                onSeeked={handleSeek}
                onVolumeChange={() => {
                  if (audioMode === 'isolated' && videoRef.current && !videoRef.current.muted) {
                    switchAudioMode('raw');
                  }
                }}
                onTimeUpdate={() => {
                  if (videoRef.current && Number.isFinite(videoRef.current.duration) && videoRef.current.duration > 0) {
                    setPlaybackProgress((videoRef.current.currentTime / videoRef.current.duration) * 100);
                  }
                  if (audioMode === 'isolated' && videoRef.current && isolatedAudioRef.current) {
                    const drift = Math.abs(videoRef.current.currentTime - isolatedAudioRef.current.currentTime);
                    if (drift > 0.35) syncIsolatedAudio();
                  }
                }}
                onEnded={() => {
                  setPlaybackProgress(100);
                  isolatedAudioRef.current?.pause();
                }}
                className="h-full w-full bg-black object-contain"
              />
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center bg-slate-950 text-xs font-bold uppercase tracking-widest text-slate-600">
              No video attached
            </div>
          )}
          <div className="border-t border-slate-800 bg-slate-950 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-white">{primaryVault?.name || 'Primary capture'}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {primaryVault?.timestamp ? format(primaryVault.timestamp, 'MMM d, HH:mm') : format(caseData.timestamp, 'MMM d, HH:mm')} capture
                </p>
              </div>
              <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-1">
                <button
                  type="button"
                  onClick={() => switchAudioMode('raw')}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                    audioMode === 'raw' ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-200"
                  )}
                >
                  Raw audio
                </button>
                <button
                  type="button"
                  onClick={() => isolatedMusic && switchAudioMode('isolated')}
                  disabled={!isolatedMusic}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-colors",
                    audioMode === 'isolated' ? "bg-emerald-600 text-white" : "text-slate-500 hover:text-slate-200",
                    !isolatedMusic && "cursor-not-allowed opacity-40 hover:text-slate-500"
                  )}
                >
                  Isolated music
                </button>
              </div>
            </div>
            {isolatedMusic && (
              <audio ref={isolatedAudioRef} preload="metadata" src={isolatedMusic.url} />
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3 overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60 p-3">
          <WaveformLane
            label="Raw audio amplitude"
            detail={rawWaveReal ? 'Original scene audio' : (rawPeaks.loading ? 'Decoding audio…' : 'Original scene audio')}
            path={rawWavePath}
            color="#60a5fa"
            peakStart={peakStart}
            peakWidth={peakWidth}
            progressPercent={playbackProgress}
          />
          <WaveformLane
            label="Isolated music amplitude"
            detail={isolatedMusic
              ? `${formatStemLabel(isolatedMusic.stem)} stem${musicWaveReal ? '' : (musicPeaks.loading ? ' · decoding…' : '')}`
              : 'Music isolation pending'}
            path={musicWavePath}
            color="#34d399"
            muted={!isolatedMusic}
            peakStart={peakStart}
            peakWidth={peakWidth}
            progressPercent={playbackProgress}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Peak region marks the strongest detected song segment in the scene.
            </p>
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
              Peak {Math.round(peakStart)}%-{Math.round(peakStart + peakWidth)}%
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function AuthorityStyleEvidencePackage({
  caseData,
  vault,
  onRequestMoreProof
}: {
  caseData: Case,
  vault: EvidenceVault,
  onRequestMoreProof: (caseId: string, vaultId: string) => void
}) {
  const scopedCaseData: Case = {
    ...caseData,
    evidenceVaults: [
      vault,
      ...caseData.evidenceVaults.filter((candidate) => candidate.id !== vault.id)
    ]
  };
  const trustPassCount = getTrustPassCount(caseData);

  return (
    <div className="space-y-5 p-5">
      <EvidenceMediaDossier caseData={scopedCaseData} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Evidence facts</p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Track</span><span className="text-right font-bold text-white">{caseData.songAssessment.title}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Artists</span><span className="text-right font-bold text-white">{caseData.songAssessment.artists.join(', ')}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">ISRC</span><span className="text-right font-mono text-xs font-bold text-blue-300">{caseData.songAssessment.isrc || 'Missing'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Rights</span><span className="text-right font-bold text-emerald-300">{caseData.songAssessment.rightsAssociation || 'Missing'}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Trust gates</span><span className="text-right font-bold text-white">{trustPassCount}/5 passed</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Reviewer interpretation</p>
          <p className="text-sm font-medium leading-6 text-slate-300">{vault.notes || caseData.aiExplanation || 'No reviewer interpretation is attached to this evidence package.'}</p>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Violation context note</p>
            <p className="mt-1 text-sm text-slate-300">{caseData.absoluteProof.performanceContext}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Evidence vault</p>
            <p className="text-sm font-black text-white">{vault.name}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{vault.notes || 'No vault notes provided.'}</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">{vault.images.length} images · {vault.videoUrl ? 'video attached' : 'fallback video used'}</p>
          </div>
          <button
            type="button"
            onClick={() => onRequestMoreProof(caseData.id, vault.id)}
            disabled={vault.moreProofRequested}
            className={cn(
              "rounded-lg border px-4 py-3 text-left text-xs font-black uppercase tracking-widest transition-colors",
              vault.moreProofRequested
                ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-blue-500/30 hover:text-blue-300"
            )}
          >
            {vault.moreProofRequested ? 'Proof requested' : 'Request more proof'}
          </button>
        </div>

        {vault.images.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            {vault.images.map((imageUrl) => (
              <div key={imageUrl} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                <img src={imageUrl} alt={`${vault.name} evidence`} className="aspect-video w-full object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BackendAnalysisActions({
  caseData,
  onRunSignalAnalysis,
  onRunDemucs,
  isSignalAnalysisRunning,
  isDemucsRunning,
  compact = false
}: {
  caseData: Case,
  onRunSignalAnalysis: (caseId: string) => void,
  onRunDemucs: (caseId: string) => void,
  isSignalAnalysisRunning: boolean,
  isDemucsRunning: boolean,
  compact?: boolean
}) {
  const isAdvancedProcessingDisabled = true;
  return (
    <section className={cn("rounded-lg border border-slate-800 bg-slate-950/50", compact ? "p-4" : "p-5")}>
      <div className="mb-4">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Backend analysis</p>
        {!compact && (
          <p className="mt-2 text-xs font-medium leading-5 text-slate-500">
            Advanced processing needs the admin v2 submission queue before it can run from the CRM.
          </p>
        )}
      </div>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onRunSignalAnalysis(caseData.id)}
          disabled={isAdvancedProcessingDisabled || isSignalAnalysisRunning || isDemucsRunning}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-xs font-black uppercase tracking-widest transition-all",
            isAdvancedProcessingDisabled || isSignalAnalysisRunning || isDemucsRunning
              ? "border-slate-800 bg-slate-900 text-slate-500"
              : "border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/15"
          )}
        >
          <span>{isAdvancedProcessingDisabled ? 'Admin v2 required' : 'Run signal analysis'}</span>
          <RefreshCcw className={cn("h-4 w-4", isSignalAnalysisRunning && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={() => onRunDemucs(caseData.id)}
          disabled={isAdvancedProcessingDisabled || isDemucsRunning || isSignalAnalysisRunning}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-xs font-black uppercase tracking-widest transition-all",
            isAdvancedProcessingDisabled || isDemucsRunning || isSignalAnalysisRunning
              ? "border-slate-800 bg-slate-900 text-slate-500"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
          )}
        >
          <span>{isAdvancedProcessingDisabled ? 'Queue wiring required' : 'Run Demucs'}</span>
          <RefreshCcw className={cn("h-4 w-4", isDemucsRunning && "animate-spin")} />
        </button>
      </div>
      <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        {caseData.id} · {caseData.audioDeconstruction?.status === 'completed' ? 'stems available' : 'stems not ready'}
      </p>
    </section>
  );
}

function AuthorityActionsPanel({
  selectedCase,
  blockingQuestions,
  onApplyRecommendedAction,
  onUpdateStage,
  setActiveTab,
  setListTab,
  onRunSignalAnalysis,
  onRunDemucs,
  isSignalAnalysisRunning,
  isDemucsRunning,
  compact = false
}: {
  selectedCase: Case,
  blockingQuestions: ReturnType<typeof getBlockingQuestions>,
  onApplyRecommendedAction: () => void,
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer') => void,
  setActiveTab: (tab: string) => void,
  setListTab: (tab: 'upcoming' | 'active' | 'closed') => void,
  onRunSignalAnalysis: (caseId: string) => void,
  onRunDemucs: (caseId: string) => void,
  isSignalAnalysisRunning: boolean,
  isDemucsRunning: boolean,
  compact?: boolean
}) {
  const toneClasses = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300'
  };
  const visibleQuestions = compact ? blockingQuestions.slice(0, 2) : blockingQuestions;

  return (
    <aside className={cn("border-l border-slate-800 bg-slate-900/50 max-xl:border-l-0", compact ? "p-4" : "p-6")}>
      <div className="sticky top-0">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">Authority actions</p>
        <p className={cn("mt-2 font-bold text-slate-400", compact ? "text-[11px]" : "text-xs")}>{selectedCase.id} · {selectedCase.location.name}</p>
        <div className={cn("mt-4", compact ? "space-y-2" : "space-y-3")}>
          <button onClick={onApplyRecommendedAction} className={cn("w-full rounded-lg bg-blue-600 text-left font-black uppercase tracking-widest text-white", compact ? "px-3 py-2.5 text-[10px]" : "px-4 py-3 text-xs")}>
            Apply recommendation
          </button>
          <button onClick={() => { onUpdateStage(selectedCase.id, 'Ready For Legal', 'Authority override: evidence sent for legal sufficiency review.', 'Lawyer'); setActiveTab('cases'); }} className={cn("w-full rounded-lg border border-slate-700 bg-slate-950/60 text-left font-black uppercase tracking-widest text-slate-300", compact ? "px-3 py-2.5 text-[10px]" : "px-4 py-3 text-xs")}>
            Send to Litigation
          </button>
          <button onClick={() => { onUpdateStage(selectedCase.id, 'Agent Assignment', 'Authority override: field verification requested.', 'Agent'); }} className={cn("w-full rounded-lg border border-slate-700 bg-slate-950/60 text-left font-black uppercase tracking-widest text-slate-300", compact ? "px-3 py-2.5 text-[10px]" : "px-4 py-3 text-xs")}>
            Assign Agent
          </button>
          <button onClick={() => { onUpdateStage(selectedCase.id, 'Closed', 'Authority closed the case after intake review.'); setListTab('closed'); }} className={cn("w-full rounded-lg border border-red-500/30 bg-red-500/10 text-left font-black uppercase tracking-widest text-red-300", compact ? "px-3 py-2.5 text-[10px]" : "px-4 py-3 text-xs")}>
            Close case
          </button>
        </div>

        <div className={compact ? "mt-4" : "mt-6"}>
          <BackendAnalysisActions
            caseData={selectedCase}
            onRunSignalAnalysis={onRunSignalAnalysis}
            onRunDemucs={onRunDemucs}
            isSignalAnalysisRunning={isSignalAnalysisRunning}
            isDemucsRunning={isDemucsRunning}
            compact
          />
        </div>

        <div className={cn("border-t border-slate-800", compact ? "mt-4 pt-4" : "mt-8 pt-6")}>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">Blocking questions</p>
          <div className={cn("mt-3", compact ? "space-y-2" : "space-y-4")}>
            {visibleQuestions.map((question) => (
              <div key={question.title} className={cn("rounded-lg border border-slate-800 bg-slate-950/50", compact ? "p-3" : "p-4")}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className={cn("font-black text-white", compact ? "text-xs" : "text-sm")}>{question.title}</p>
                  <span className={cn("shrink-0 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-widest", toneClasses[question.tone])}>
                    {question.status}
                  </span>
                </div>
                {!compact && <p className="text-xs leading-5 text-slate-500">{question.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

// Venue-first landing page. Groups cases by location.name and surfaces only
// real, already-computed facts per venue (case/song/verified counts, real
// dispute/readiness tallies from contract data) — deliberately no fabricated
// "Enforcement Priority"/"Actionability" composite score; that pattern was
// removed everywhere else this session and shouldn't come back in here.
function VenueListPage({ cases, onOpenVenue }: { cases: Case[]; onOpenVenue: (caseId: string) => void }) {
  const venues = useMemo(() => {
    const byName = new Map<string, Case[]>();
    cases.forEach((caseData) => {
      const key = caseData.location.name || 'Unverified location';
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(caseData);
    });
    return [...byName.entries()].map(([name, venueCases]) => {
      const sorted = [...venueCases].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const uniqueSongs = new Set(
        venueCases.map((c) => c.songAssessment.title).filter((title) => title && title !== 'Unknown Track')
      ).size;
      const reviewableCount = venueCases.filter((c) => c.contract?.crm_readiness?.is_case_ready).length;
      const disputedCount = venueCases.filter((c) => c.contract?.venue_delta?.flagged).length;
      const verifiedCount = venueCases.filter((c) => c.trustGates.mediaHashKey && c.trustGates.payloadSignature).length;
      return {
        name,
        city: sorted[0]?.location.city || '',
        address: sorted[0]?.location.address || '',
        cases: sorted,
        caseCount: venueCases.length,
        uniqueSongs,
        reviewableCount,
        disputedCount,
        verifiedCount,
        lastCaptureAt: sorted[0]?.timestamp || null,
      };
    }).sort((a, b) => (b.lastCaptureAt?.getTime() || 0) - (a.lastCaptureAt?.getTime() || 0));
  }, [cases]);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
      <div className="mb-6">
        <p className="text-[10px] font-black uppercase tracking-[0.26em] text-blue-400">Authority</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Venues</h1>
        <p className="mt-2 text-sm font-medium text-slate-400">{venues.length} venues · {cases.length} cases</p>
      </div>

      {venues.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50 text-slate-500">
          <p className="text-sm font-bold">No venues yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {venues.map((venue) => (
            <button
              key={venue.name}
              type="button"
              onClick={() => onOpenVenue(venue.cases[0].id)}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left transition-colors hover:border-blue-500/40 hover:bg-slate-900/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-black text-white">{venue.name}</h3>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{venue.city || venue.address || 'Unverified location'}</p>
                  </div>
                </div>
                {venue.disputedCount > 0 ? (
                  <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-red-300">
                    {venue.disputedCount} disputed
                  </span>
                ) : venue.reviewableCount === venue.caseCount ? (
                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-300">
                    Reviewable
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300">
                    Mixed
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-black text-white">{venue.caseCount}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Cases</p>
                </div>
                <div>
                  <p className="text-lg font-black text-white">{venue.uniqueSongs}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Songs</p>
                </div>
                <div>
                  <p className="text-lg font-black text-white">{venue.verifiedCount}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Verified</p>
                </div>
              </div>

              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                Last capture: {venue.lastCaptureAt ? format(venue.lastCaptureAt, 'MMM d, HH:mm') : 'n/a'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AuthorityVenueEvidencePage({
  cases,
  selectedCaseId,
  onSelectCase,
  onUpdateStage,
  onRequestMoreProof,
  setActiveTab,
  setListTab,
  onRunSignalAnalysis,
  onRunDemucs,
  runningSignalAnalysisIds,
  runningDemucsIds
}: {
  cases: Case[],
  selectedCaseId: string | null,
  onSelectCase: (id: string) => void,
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer') => void,
  onRequestMoreProof: (caseId: string, vaultId: string) => void,
  setActiveTab: (tab: string) => void,
  setListTab: (tab: 'upcoming' | 'active' | 'closed') => void,
  onRunSignalAnalysis: (caseId: string) => void,
  onRunDemucs: (caseId: string) => void,
  runningSignalAnalysisIds: Set<string>,
  runningDemucsIds: Set<string>
}) {
  const selectedCase = cases.find((caseData) => caseData.id === selectedCaseId) || cases[0];
  const [expandedVaultIds, setExpandedVaultIds] = useState<Set<string>>(() => new Set());
  const [expandedCaseIds, setExpandedCaseIds] = useState<Set<string>>(() => new Set());

  const venueCases = useMemo(() => {
    if (!selectedCase) return [];
    return [...cases]
      .filter((caseData) => caseData.location.name === selectedCase.location.name)
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  }, [cases, selectedCase]);

  useEffect(() => {
    if (!selectedCase?.evidenceVaults[0]) return;
    setExpandedVaultIds((current) => {
      if (current.size > 0) return current;
      return new Set([selectedCase.evidenceVaults[0].id]);
    });
  }, [selectedCase?.id, selectedCase?.evidenceVaults]);

  useEffect(() => {
    if (!selectedCase?.id) return;
    setExpandedCaseIds((current) => {
      if (current.has(selectedCase.id)) return current;
      return new Set([...current, selectedCase.id]);
    });
  }, [selectedCase?.id]);

  if (!selectedCase) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-500">
        <p className="text-sm font-bold">No venue evidence available.</p>
      </div>
    );
  }

  const venueValue = venueCases.reduce((sum, caseData) => sum + caseData.recoverableValue, 0);
  const packageCount = venueCases.reduce((sum, caseData) => sum + caseData.evidenceVaults.length, 0);
  const profile = getDecisionProfile(selectedCase);
  const blockingQuestions = getBlockingQuestions(selectedCase);

  const selectCase = (caseId: string) => {
    onSelectCase(caseId);
    const nextPath = `/authority/venues/${encodeURIComponent(caseId)}`;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  const applyRecommendedAction = () => {
    if (profile.action === 'Send to Litigation') {
      onUpdateStage(selectedCase.id, 'Ready For Legal', profile.reason, 'Lawyer');
      setListTab('active');
      return;
    }
    if (profile.action === 'Assign to Agent') {
      const vaultId = selectedCase.evidenceVaults[0]?.id;
      if (vaultId) onRequestMoreProof(selectedCase.id, vaultId);
      onUpdateStage(selectedCase.id, 'Agent Assignment', profile.reason, 'Agent');
      setListTab('active');
      return;
    }
    if (profile.action === 'Close Candidate') {
      onUpdateStage(selectedCase.id, 'Closed', profile.reason);
      setListTab('closed');
      return;
    }
    onUpdateStage(selectedCase.id, 'Under Review', profile.reason);
    setListTab('active');
  };

  const toggleVault = (vaultId: string) => {
    setExpandedVaultIds((current) => {
      const next = new Set(current);
      if (next.has(vaultId)) next.delete(vaultId);
      else next.add(vaultId);
      return next;
    });
  };

  const toggleCaseEvidence = (caseId: string) => {
    setExpandedCaseIds((current) => {
      const next = new Set(current);
      if (next.has(caseId)) next.delete(caseId);
      else next.add(caseId);
      return next;
    });
  };

  return (
    <div className="grid h-full grid-cols-[260px_minmax(0,0.9fr)_260px] overflow-hidden bg-slate-950 text-slate-100 max-xl:grid-cols-1 max-xl:overflow-y-auto">
      <aside className="border-r border-slate-800 bg-slate-900/50 max-xl:border-r-0">
        <div className="border-b border-slate-800 p-4">
          <button
            type="button"
            onClick={() => setActiveTab('cases')}
            className="mb-4 inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-blue-300"
          >
            <ArrowRight className="h-3 w-3 rotate-180" />
            Authority queue
          </button>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-400">Venue evidence</p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white">{selectedCase.location.name}</h2>
          <p className="mt-2 line-clamp-3 text-[11px] font-medium leading-4 text-slate-400">{selectedCase.location.address}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Cases</p>
              <p className="mt-1 text-lg font-black text-white">{venueCases.length}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Packages</p>
              <p className="mt-1 text-lg font-black text-white">{packageCount}</p>
            </div>
          </div>
        </div>

        <div className="max-h-[calc(100dvh - 15.5rem)] overflow-y-auto">
          {venueCases.map((caseData) => {
            const caseProfile = getDecisionProfile(caseData);
            return (
              <button
                key={caseData.id}
                type="button"
                onClick={() => selectCase(caseData.id)}
                className={cn(
                  "w-full border-b border-slate-800 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]",
                  selectedCase.id === caseData.id && "bg-blue-500/10"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-300">{caseData.id}</p>
                  <span className="text-[10px] font-black text-white">{trackIdentityLabel(caseData)}</span>
                </div>
                <h3 className="truncate text-xs font-black text-white">{caseData.songAssessment.title}</h3>
                <p className="mt-1 text-[10px] text-slate-500">{format(caseData.timestamp, 'MMM d, HH:mm')} · {caseProfile.action}</p>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="overflow-y-auto p-5">
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">{selectedCase.id} · active case</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Evidence against {selectedCase.location.name}</h1>
              <p className="mt-2 max-w-3xl text-xs font-medium leading-5 text-slate-400">
                This page keeps the authority action rail bound to the case selected here while the center view shows every case and evidence package recorded against the venue.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Venue value</p>
                <p className="mt-1 text-xl font-black text-blue-300">₹{(venueValue / 1000).toFixed(0)}k</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Current stage</p>
                <p className="mt-1 text-xs font-black text-white">{selectedCase.stage}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 space-y-4">
          {venueCases.map((caseData) => {
            const isCaseExpanded = expandedCaseIds.has(caseData.id);
            return (
            <div key={caseData.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      selectCase(caseData.id);
                      toggleCaseEvidence(caseData.id);
                    }}
                    className="text-left"
                  >
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-400">{caseData.id} · {format(caseData.timestamp, 'MMM d, yyyy HH:mm')}</p>
                    <h2 className="mt-2 text-xl font-black tracking-tight text-white">{caseData.songAssessment.title}</h2>
                    <p className="mt-1 text-xs font-medium text-slate-400">{caseData.songAssessment.artists.join(', ')} · {caseData.musicLabel}</p>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">{caseData.stage}</span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">{getTrustPassCount(caseData)}/5 trust</span>
                  <button
                    type="button"
                    onClick={() => {
                      selectCase(caseData.id);
                      toggleCaseEvidence(caseData.id);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:border-blue-500/40 hover:text-blue-300"
                  >
                    Evidence
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isCaseExpanded && "rotate-180 text-blue-300")} />
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {isCaseExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mb-4 space-y-5 overflow-hidden"
                  >
                    <RawVideoPanel caseData={caseData} />
                    <ReviewReadinessPanel caseData={caseData} />
                    <SignalEvidencePanel caseData={caseData} compact />
                    <RawAnalysisPanel caseData={caseData} />
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid gap-3">
                {caseData.evidenceVaults.map((vault) => {
                  const isExpanded = expandedVaultIds.has(vault.id);
                  const videoUrl = vault.videoUrl || caseData.videoProofUrl || caseData.absoluteProof.smallVideoUrl;
                  return (
                    <div key={vault.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/50">
                      <button
                        type="button"
                        onClick={() => toggleVault(vault.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 text-left transition-colors hover:bg-white/[0.03]"
                      >
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black text-white">{vault.name}</p>
                            <span className={cn(
                              "rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-widest",
                              vault.moreProofRequested ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            )}>
                              {vault.moreProofRequested ? 'Proof requested' : 'Reviewable'}
                            </span>
                          </div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                            {format(vault.timestamp, 'MMM d, HH:mm')} · {vault.images.length} images · {videoUrl ? 'video attached' : 'no video'}
                          </p>
                        </div>
                        <ChevronDown className={cn("h-4 w-4 text-slate-500 transition-transform", isExpanded && "rotate-180 text-blue-300")} />
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-slate-800"
                          >
                            <AuthorityStyleEvidencePackage
                              caseData={caseData}
                              vault={vault}
                              onRequestMoreProof={onRequestMoreProof}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          );
          })}
        </section>
      </main>

      <AuthorityActionsPanel
        selectedCase={selectedCase}
        blockingQuestions={blockingQuestions}
        onApplyRecommendedAction={applyRecommendedAction}
        onUpdateStage={onUpdateStage}
        setActiveTab={setActiveTab}
        setListTab={setListTab}
        onRunSignalAnalysis={onRunSignalAnalysis}
        onRunDemucs={onRunDemucs}
        isSignalAnalysisRunning={runningSignalAnalysisIds.has(selectedCase.id)}
        isDemucsRunning={runningDemucsIds.has(selectedCase.id)}
        compact
      />
    </div>
  );
}

function VenueCaseStack({
  venueCases,
  selectedCaseId,
  onSelectCase
}: {
  venueCases: Case[],
  selectedCaseId: string,
  onSelectCase: (caseId: string) => void
}) {
  const songsCaught = useMemo(() => {
    const grouped = new Map<string, {
      title: string;
      artists: string;
      isrc: string;
      rights: string;
      cases: Case[];
      bestScore: number;
      value: number;
      latest: Date;
    }>();

    venueCases.forEach((caseData) => {
      const key = caseData.songAssessment.isrc || `${caseData.songAssessment.title}:${caseData.songAssessment.artists.join(',')}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.cases.push(caseData);
        existing.bestScore = Math.max(existing.bestScore, caseData.qualityScore);
        existing.value += caseData.recoverableValue;
        if (caseData.timestamp > existing.latest) existing.latest = caseData.timestamp;
        return;
      }

      grouped.set(key, {
        title: caseData.songAssessment.title,
        artists: caseData.songAssessment.artists.join(', '),
        isrc: caseData.songAssessment.isrc || 'No ISRC',
        rights: caseData.songAssessment.rightsAssociation || 'Rights pending',
        cases: [caseData],
        bestScore: caseData.qualityScore,
        value: caseData.recoverableValue,
        latest: caseData.timestamp
      });
    });

    return [...grouped.values()].sort((left, right) => right.latest.getTime() - left.latest.getTime());
  }, [venueCases]);

  return (
    <section className="space-y-5">
      <div className="rounded-md border border-white/10 bg-[#111113] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.32em] text-slate-500">Detected tracks</p>
            <h3 className="mt-2 text-lg font-black tracking-tight text-white">{songsCaught.length} song{songsCaught.length === 1 ? '' : 's'} shown</h3>
          </div>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-[10px] font-black text-emerald-200">
            {venueCases.length} linked case{venueCases.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="overflow-hidden rounded-md border border-white/10">
          <div className="grid grid-cols-[0.8fr_1.4fr_1fr_0.8fr_0.7fr] border-b border-white/10 bg-white/[0.03] px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 max-lg:hidden">
            <span>Date</span>
            <span>Track</span>
            <span>Artist</span>
            <span>Source</span>
            <span className="text-right">Conf</span>
          </div>
          {songsCaught.map((song) => (
            <div key={`${song.title}:${song.isrc}`} className="grid grid-cols-[0.8fr_1.4fr_1fr_0.8fr_0.7fr] items-center gap-4 border-b border-white/5 px-4 py-4 last:border-b-0 max-lg:grid-cols-1">
              <p className="font-mono text-xs font-bold text-slate-400">{format(song.latest, 'MM-dd')}</p>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{song.title}</p>
                <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-600">{song.isrc} · {song.rights}</p>
              </div>
              <p className="truncate text-sm font-medium text-slate-400">{song.artists}</p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] font-bold text-slate-300">
                  {song.cases.length} case{song.cases.length === 1 ? '' : 's'}
                </span>
                <span className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[10px] font-bold text-slate-300">
                  ₹{(song.value / 1000).toFixed(0)}k value
                </span>
              </div>
              <p className="font-mono text-sm font-black text-emerald-300 lg:text-right">{song.bestScore}%</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-white/10 bg-[#111113] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.32em] text-slate-500">Attached cases</p>
            <h3 className="mt-2 text-lg font-black tracking-tight text-white">{venueCases.length} case record{venueCases.length === 1 ? '' : 's'}</h3>
          </div>
          <span className="rounded-md border border-slate-700 px-3 py-1.5 font-mono text-[10px] font-black text-slate-400">
            ₹{(venueCases.reduce((sum, caseData) => sum + caseData.recoverableValue, 0) / 1000).toFixed(0)}k total
          </span>
        </div>
        <div className="grid gap-3">
          {venueCases.map((caseData) => {
            const profile = getDecisionProfile(caseData);
            return (
              <button
                key={caseData.id}
                type="button"
                onClick={() => onSelectCase(caseData.id)}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md border p-4 text-left transition-colors",
                  selectedCaseId === caseData.id
                    ? "border-sky-500/40 bg-sky-500/10"
                    : "border-white/10 bg-black/30 hover:border-slate-700 hover:bg-white/[0.03]"
                )}
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] font-black uppercase tracking-widest text-sky-300">{caseData.id}</span>
                    <span className="font-mono text-[10px] font-bold text-slate-600">{format(caseData.timestamp, 'MMM d, HH:mm')}</span>
                    <span className="rounded-md border border-slate-700 px-2 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest text-slate-400">{caseData.stage}</span>
                  </div>
                  <p className="truncate text-sm font-black text-white">{caseData.songAssessment.title}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{caseData.songAssessment.artists.join(', ')} · {caseData.songAssessment.isrc || 'No ISRC'}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{caseData.absoluteProof.performanceContext}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-white">{trackIdentityLabel(caseData)}</p>
                  <p className={cn(
                    "mt-1 font-mono text-[9px] font-black uppercase tracking-widest",
                    profile.tone === 'green' ? "text-emerald-300" : profile.tone === 'red' ? "text-red-300" : profile.tone === 'purple' ? "text-purple-300" : "text-amber-300"
                  )}>
                    {profile.action}
                  </p>
                  <p className="mt-2 font-mono text-[9px] font-black uppercase tracking-widest text-sky-300">Open evidence</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const evidenceToneFromStatus = (status: SignalEvidenceLayer['status']): 'green' | 'amber' | 'red' => (
  status === 'verified' || status === 'usable' ? 'green' : status === 'blocked' ? 'red' : 'amber'
);

const toneFromGrade = (grade: PerformanceContextGrade): 'green' | 'amber' | 'red' => (
  grade === 'strong' ? 'green' : grade === 'invalid' ? 'red' : 'amber'
);

function CaseAnalysisPanel({ caseData }: { caseData: Case }) {
  const venueAttributionSignal = getVenueAttributionSignal(caseData);
  const performanceContextProfile = getPerformanceContextProfile(caseData);
  const mandateProfile = getViolationMandateProfile(caseData);
  const hasTrack = Boolean(caseData.songAssessment.title && caseData.songAssessment.title !== 'Unknown Track');
  const rightsKnown = Boolean(caseData.songAssessment.rightsAssociation && caseData.songAssessment.rightsAssociation !== 'Pending analyst review');
  const trustPassCount = getTrustPassCount(caseData);

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Detailed case analysis</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-white">{caseData.id}</h3>
          <p className="mt-1 text-sm font-medium text-slate-400">{caseData.location.name} • {format(caseData.timestamp, 'MMM d, yyyy HH:mm')}</p>
        </div>
        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-300">
          ₹{caseData.recoverableValue.toLocaleString()} recovery
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
        <FactBadge label="Track proof" value={hasTrack ? 'Identified' : 'Not identified'} tone={hasTrack ? 'green' : 'red'} />
        <FactBadge label="Venue proof" value={humanizeToken(venueAttributionSignal.status)} tone={evidenceToneFromStatus(venueAttributionSignal.status)} />
        <FactBadge
          label="Violation context"
          value={humanizeToken(performanceContextProfile.grade)}
          tone={toneFromGrade(performanceContextProfile.grade)}
          detail={`${performanceContextProfile.reason} Mandate: ${mandateProfile.label}.`}
        />
        <FactBadge label="Rights readiness" value={rightsKnown ? 'Resolved' : 'Pending review'} tone={rightsKnown ? 'green' : 'amber'} />
      </div>

      <EvidenceMediaDossier caseData={caseData} />

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Evidence facts</p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Track</span><span className="text-right font-bold text-white">{caseData.songAssessment.title}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Artists</span><span className="text-right font-bold text-white">{caseData.songAssessment.artists.join(', ')}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">ISRC</span><span className="text-right font-mono text-xs font-bold text-blue-300">{caseData.songAssessment.isrc}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Rights</span><span className="text-right font-bold text-emerald-300">{caseData.songAssessment.rightsAssociation}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Trust gates</span><span className="text-right font-bold text-white">{trustPassCount}/5 passed</span></div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Reviewer interpretation</p>
          <p className="text-sm font-medium leading-6 text-slate-300">{caseData.aiExplanation}</p>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Violation context note</p>
            <p className="mt-1 text-sm text-slate-300">{caseData.absoluteProof.performanceContext}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Evidence vaults</p>
        <div className="grid gap-3">
          {caseData.evidenceVaults.map((vault) => (
            <div key={vault.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-black text-white">{vault.name}</p>
                <span className={cn(
                  "rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest",
                  vault.moreProofRequested ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                )}>
                  {vault.moreProofRequested ? 'Proof requested' : 'Reviewable'}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">{vault.notes || 'No vault notes provided.'}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">{vault.images.length} images • {vault.videoUrl ? 'video attached' : 'no video'}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AuthorityConsoleMetrics({
  selectedCase,
  venueCases
}: {
  selectedCase: Case;
  venueCases: Case[];
}) {
  const venueAttributionSignal = getVenueAttributionSignal(selectedCase);
  const performanceContextProfile = getPerformanceContextProfile(selectedCase);
  const hasTrack = Boolean(selectedCase.songAssessment.title && selectedCase.songAssessment.title !== 'Unknown Track');
  const rightsKnown = Boolean(selectedCase.songAssessment.rightsAssociation && selectedCase.songAssessment.rightsAssociation !== 'Pending analyst review');
  const trustPassCount = getTrustPassCount(selectedCase);
  // Every value below is a real status/count read straight off the case — no
  // synthesized percentage, no fabricated average.
  const metricItems = [
    { label: 'Integrity coverage', value: `${trustPassCount}/5`, detail: 'trust gates passed', icon: <LockKeyhole className="h-4 w-4" /> },
    { label: 'Venue attribution', value: humanizeToken(venueAttributionSignal.status), detail: humanizeToken(selectedCase.venueAttribution?.status || selectedCase.locationDelta?.geoBucket || 'pending'), icon: <Navigation className="h-4 w-4" /> },
    { label: 'Audio identity', value: hasTrack ? 'Identified' : 'Not identified', detail: selectedCase.songAssessment.isrc || 'retry queue', icon: <Music className="h-4 w-4" /> },
    { label: 'Rights readiness', value: rightsKnown ? 'Resolved' : 'Pending review', detail: selectedCase.songAssessment.rightsAssociation || 'main blocker', icon: <ShieldCheck className="h-4 w-4" /> },
    { label: 'Violation context', value: humanizeToken(performanceContextProfile.grade), detail: 'mandate posture', icon: <Gavel className="h-4 w-4" /> },
    { label: 'Fact tables', value: String(venueCases.length), detail: 'linked cases', icon: <Columns className="h-4 w-4" /> }
  ];

  return (
    <div className="grid border-b border-white/10 bg-[#111113] max-lg:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {metricItems.map((item) => (
        <div key={item.label} className="border-r border-white/10 px-5 py-4 last:border-r-0">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-widest text-slate-500">
            <span className="text-slate-400">{item.icon}</span>
            {item.label}
          </div>
          <p className="text-2xl font-black tracking-tight text-white">{item.value}</p>
          <p className="mt-1 text-sm font-medium text-slate-400">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function AuthorityCaseFactsRail({
  selectedCase,
  profile,
  sourceContext,
  blockingQuestions
}: {
  selectedCase: Case;
  profile: ReturnType<typeof getDecisionProfile>;
  sourceContext: ReturnType<typeof detectSourceContext>;
  blockingQuestions: ReturnType<typeof getBlockingQuestions>;
}) {
  const venueAttributionSignal = getVenueAttributionSignal(selectedCase);
  const selectedDeltas = toFiniteNumbers([
    selectedCase.venueAttribution?.selectedVenueDistanceStartMeters ?? selectedCase.locationDelta?.selectedVenueDistanceStartMeters,
    selectedCase.venueAttribution?.selectedVenueDistanceEndMeters ?? selectedCase.locationDelta?.selectedVenueDistanceEndMeters,
  ]);
  const selectedMin = selectedDeltas.length ? Math.min(...selectedDeltas) : null;
  const fields = [
    ['Case ID', selectedCase.id],
    ['Venue', selectedCase.location.name],
    ['Track', selectedCase.songAssessment.title],
    ['Artist', selectedCase.songAssessment.artists.join(', ')],
    ['Stage', selectedCase.stage],
    ['Disposition', profile.action],
    ['Venue attribution', humanizeToken(venueAttributionSignal.status)],
    ['Selected venue delta', formatMeters(selectedMin)],
    ['Source context', sourceContext.label],
    ['Rights', selectedCase.songAssessment.rightsAssociation || 'pending'],
    ['Trust gates', `${getTrustPassCount(selectedCase)}/5 passed`]
  ];

  return (
    <aside className="border-l border-white/10 bg-[#0d0d0f] p-5 text-slate-100 max-2xl:hidden">
      <div className="sticky top-0">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-black text-white">Case Detail</p>
            <p className="font-mono text-xs text-slate-500">{selectedCase.id}</p>
          </div>
          <span className={cn(
            "rounded-md border px-2.5 py-1 font-mono text-[10px] font-black",
            profile.tone === 'green' ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : profile.tone === 'red' ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-sky-500/30 bg-sky-500/10 text-sky-200"
          )}>
            {profile.action}
          </span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-white/10 bg-[#121214] p-4">
            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-600">Readiness</p>
            <p className="mt-2 text-lg font-black text-white">{getEvidenceVerdict(buildSignalEvidenceLayers(selectedCase)).label}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-[#121214] p-4">
            <p className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-600">Value</p>
            <p className="mt-2 text-2xl font-black text-white">₹{selectedCase.recoverableValue.toLocaleString()}</p>
          </div>
        </div>

        <p className="mb-3 font-mono text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Case fields</p>
        <div className="overflow-hidden rounded-md border border-white/10">
          {fields.map(([label, value]) => (
            <div key={label} className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)] border-b border-white/10 px-3 py-3 last:border-b-0 gap-1 md:gap-0">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="truncate text-sm font-bold text-slate-200">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <p className="mb-3 font-mono text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Review blockers</p>
          <div className="space-y-2">
            {blockingQuestions.slice(0, 4).map((question) => (
              <div key={question.title} className="rounded-md border border-white/10 bg-[#121214] p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-black text-white">{question.title}</p>
                  <span className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-500">{question.status}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{question.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function AuthorityDecisionCockpit({
  cases,
  selectedCaseId,
  onSelectCase,
  onOpenVenueEvidence,
  onUpdateStage,
  onRequestMoreProof,
  setActiveTab,
  setListTab,
  onRunSignalAnalysis,
  onRunDemucs,
  runningSignalAnalysisIds,
  runningDemucsIds
}: {
  cases: Case[],
  selectedCaseId: string | null,
  onSelectCase: (id: string) => void,
  onOpenVenueEvidence: (id: string) => void,
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer') => void,
  onRequestMoreProof: (caseId: string, vaultId: string) => void,
  setActiveTab: (tab: string) => void,
  setListTab: (tab: 'upcoming' | 'active' | 'closed') => void,
  onRunSignalAnalysis: (caseId: string) => void,
  onRunDemucs: (caseId: string) => void,
  runningSignalAnalysisIds: Set<string>,
  runningDemucsIds: Set<string>
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [qualityFilter, setQualityFilter] = useState<'all' | 'high' | 'low'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionStage, setBulkActionStage] = useState<CaseStage | null>(null);

  const prioritizedCases = useMemo(() => {
    let filtered = [...cases]
      .filter((caseData) => caseData.stage !== 'Closed')
      .sort(compareCasesByPriority);

    // Apply quality filter
    if (qualityFilter === 'high') {
      filtered = filtered.filter(c => c.qualityScore >= 80);
    } else if (qualityFilter === 'low') {
      filtered = filtered.filter(c => c.qualityScore < 80);
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.id.toLowerCase().includes(query) ||
        c.location.name.toLowerCase().includes(query) ||
        c.location.city.toLowerCase().includes(query) ||
        c.songAssessment.title.toLowerCase().includes(query) ||
        c.songAssessment.artists.some(a => a.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [cases, searchQuery, qualityFilter]);

  // Calculate metrics for filtered cases
  const filteredMetrics = useMemo(() => {
    const totalValue = prioritizedCases.reduce((sum, c) => sum + c.recoverableValue, 0);
    const avgQuality = prioritizedCases.length > 0
      ? Math.round(prioritizedCases.reduce((sum, c) => sum + c.qualityScore, 0) / prioritizedCases.length)
      : 0;
    return { totalValue, avgQuality };
  }, [prioritizedCases]);

  const selectedCase = prioritizedCases.find((caseData) => caseData.id === selectedCaseId) || prioritizedCases[0] || cases[0];
  const venueCases = useMemo(() => (
    [...cases]
      .filter((caseData) => caseData.location.name === selectedCase?.location.name)
      .sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime())
  ), [cases, selectedCase?.location.name]);
  const profile = selectedCase ? getDecisionProfile(selectedCase) : null;
  const performanceContextProfile = selectedCase ? getPerformanceContextProfile(selectedCase) : null;
  const mandateProfile = selectedCase ? getViolationMandateProfile(selectedCase) : null;
  const blockingQuestions = selectedCase ? getBlockingQuestions(selectedCase) : [];
  const sourceContext = selectedCase ? detectSourceContext(selectedCase) : null;

  if (!selectedCase || !profile) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-500">
        <p className="text-sm font-bold">No cases available for authority triage.</p>
      </div>
    );
  }

  const applyRecommendedAction = () => {
    if (profile.action === 'Send to Litigation') {
      onUpdateStage(selectedCase.id, 'Ready For Legal', profile.reason, 'Lawyer');
      setListTab('active');
      return;
    }
    if (profile.action === 'Assign to Agent') {
      const vaultId = selectedCase.evidenceVaults[0]?.id;
      if (vaultId) onRequestMoreProof(selectedCase.id, vaultId);
      onUpdateStage(selectedCase.id, 'Agent Assignment', profile.reason, 'Agent');
      setListTab('active');
      return;
    }
    if (profile.action === 'Close Candidate') {
      onUpdateStage(selectedCase.id, 'Closed', profile.reason);
      setListTab('closed');
      return;
    }
    onUpdateStage(selectedCase.id, 'Under Review', profile.reason);
    setListTab('active');
  };

  const toneClasses = {
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-300'
  };

  return (
    <div className="grid h-full grid-cols-[340px_minmax(0,1fr)_360px] overflow-hidden bg-[#09090b] text-slate-100 max-2xl:grid-cols-[340px_minmax(0,1fr)] max-xl:grid-cols-1 max-xl:overflow-y-auto">
      <aside className="border-r border-white/10 bg-[#0d0d0f] max-xl:border-r-0 flex flex-col h-full overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-[#141417] text-sky-200">
              <Columns className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-white">Signal Console</h2>
              <p className="text-xs font-medium text-slate-500">Directed authority intake</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-[#141417] px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search case, venue, signal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white transition-colors"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            {['all', 'high', 'low'].map(filter => (
              <button
                key={filter}
                onClick={() => setQualityFilter(filter as 'all' | 'high' | 'low')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
                  qualityFilter === filter
                    ? "bg-blue-500/20 border border-blue-500/40 text-blue-300"
                    : "bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200"
                )}
              >
                {filter === 'all' ? 'All Quality' : filter === 'high' ? 'High (80+)' : 'Low (<80)'}
              </button>
            ))}
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-white">Signal Work Queue</p>
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] font-black text-slate-300">{prioritizedCases.length} cases</span>
            </div>
            {(searchQuery || qualityFilter !== 'all') && (
              <div className="text-[9px] text-slate-500 space-y-1">
                {searchQuery && <p>🔍 Search: "{searchQuery}"</p>}
                {qualityFilter !== 'all' && <p>📊 Quality: {qualityFilter === 'high' ? 'High (80+)' : 'Low (<80)'}</p>}
                <p className="text-slate-400 font-bold">Showing {prioritizedCases.length} of {cases.filter(c => c.stage !== 'Closed').length} active</p>
              </div>
            )}
            <div className="pt-2 border-t border-white/5">
              <div className="rounded-md bg-white/[0.02] p-2">
                <div className="flex items-center gap-2">
                  <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Avg Quality</p>
                  <div className="group relative">
                    <button className="text-slate-500 hover:text-slate-300 transition-colors" title="Quality scores are derived from evidence verification, forensic analysis, and venue context assessment.">
                      <HelpCircle className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-900 border border-white/10 rounded-md px-2 py-1 text-[8px] text-slate-300 whitespace-nowrap z-10">
                      Average of case quality scores
                    </div>
                  </div>
                </div>
                <p className="text-sm font-black text-blue-400 mt-1">{filteredMetrics.avgQuality}%</p>
              </div>
            </div>
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="border-t border-white/10 bg-blue-500/10 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-black text-blue-300">{selectedIds.size} case{selectedIds.size !== 1 ? 's' : ''} selected</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    selectedIds.forEach(id => {
                      onUpdateStage(id, 'Under Review', 'Bulk action: moved to Under Review');
                    });
                    setSelectedIds(new Set());
                  }}
                  className="px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30 transition-all"
                >
                  Review
                </button>
                <button
                  onClick={() => {
                    selectedIds.forEach(id => {
                      onUpdateStage(id, 'Agent Assignment', 'Bulk action: assigned to agent');
                    });
                    setSelectedIds(new Set());
                  }}
                  className="px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition-all"
                >
                  Assign
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 transition-all"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          {prioritizedCases.length === 0 ? (
            <div className="p-5">
              <PanelState type="empty" message="No active cases available." />
            </div>
          ) : prioritizedCases.map((caseData) => {
            const rowProfile = getDecisionProfile(caseData);
            return (
              <button
                key={caseData.id}
                type="button"
                onClick={() => {
                  if (selectedIds.size > 0 || (selectedIds.size === 0 && selectedIds.has(caseData.id))) {
                    // Toggle bulk selection
                    const newIds = new Set(selectedIds);
                    if (newIds.has(caseData.id)) {
                      newIds.delete(caseData.id);
                    } else {
                      newIds.add(caseData.id);
                    }
                    setSelectedIds(newIds);
                  } else {
                    onSelectCase(caseData.id);
                  }
                }}
                className={cn(
                  "w-full border-b border-white/10 px-5 py-5 text-left transition-colors hover:bg-white/[0.03]",
                  selectedCase.id === caseData.id && !selectedIds.has(caseData.id) && "bg-white/[0.06]",
                  selectedIds.has(caseData.id) && "bg-blue-500/10 border-blue-500/30"
                )}
              >
                <div className="flex items-start gap-3">
                  {selectedIds.size > 0 && (
                    <div className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5",
                      selectedIds.has(caseData.id)
                        ? "bg-blue-500 border-blue-500"
                        : "border-slate-600"
                    )}>
                      {selectedIds.has(caseData.id) && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-500">{caseData.id}</span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <span className={cn("rounded-md border px-2.5 py-1 font-mono text-[9px] font-black", toneClasses[rowProfile.tone])}>
                          {rowProfile.action}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-sm font-black text-white">{caseData.location.name}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">{caseData.songAssessment.title} · {caseData.location.city}</p>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p className="text-xs font-bold text-slate-400">{rowProfile.blocker}</p>
                      <div className="text-right">
                        <p className="text-sm font-black text-white">{trackIdentityLabel(caseData)}</p>
                        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-600">track</p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="overflow-y-auto h-full">
        <AuthorityConsoleMetrics
          selectedCase={selectedCase}
          venueCases={venueCases}
        />
        <div className="border-b border-white/10 bg-[#0d0d0f] p-5">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-[11px] font-black uppercase tracking-widest text-slate-500">{selectedCase.id}</p>
                <span className={cn("rounded-md border px-2 py-1 font-mono text-[10px] font-black", toneClasses[profile.tone])}>{profile.action}</span>
                {mandateProfile && (
                  <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] font-black text-slate-300">
                    {mandateProfile.bodies.length ? mandateProfile.bodies.join(' + ') : 'unmapped'}
                  </span>
                )}
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white">{selectedCase.location.name}</h1>
              <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-400">
                Venue-first intake: detected songs are grouped under the venue, with every attached case available as the evidence route.
              </p>
              <button
                type="button"
                onClick={() => onOpenVenueEvidence(selectedCase.id)}
                className="mt-4 inline-flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 font-mono text-[10px] font-black uppercase tracking-widest text-sky-200 transition-colors hover:bg-sky-500/15"
              >
                Open detailed evidence view
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-5">
              {(() => {
                const verdict = getEvidenceVerdict(buildSignalEvidenceLayers(selectedCase));
                const ringClass = verdict.tone === 'green' ? 'border-emerald-500' : verdict.tone === 'red' ? 'border-red-500' : 'border-amber-500';
                return (
                  <>
                    <div className={cn("relative h-24 w-24 rounded-full border-[10px] shadow-[0_0_0_1px_rgba(255,255,255,0.08)]", ringClass)} />
                    <div>
                      <p className="text-xl font-black text-white">{verdict.label}</p>
                      <p className="mt-1 text-sm font-medium text-slate-400">evidence verdict</p>
                      <p className="mt-3 max-w-44 text-sm font-black text-sky-200">{profile.action}</p>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-5 space-y-5">
            <ReviewReadinessPanel caseData={selectedCase} />
            <RawAnalysisPanel caseData={selectedCase} />
            <RepeatCaptureSummaryPanel caseData={selectedCase} venueCases={venueCases} />
            <IncidentTimelinePanel caseData={selectedCase} venueCases={venueCases} onOpenCapture={onOpenVenueEvidence} />
          </div>
          <VenueCaseStack
            venueCases={venueCases}
            selectedCaseId={selectedCase.id}
            onSelectCase={onOpenVenueEvidence}
          />
        </div>
      </main>
      {sourceContext && (
        <AuthorityCaseFactsRail
          selectedCase={selectedCase}
          profile={profile}
          sourceContext={sourceContext}
          blockingQuestions={blockingQuestions}
        />
      )}
    </div>
  );
}

function AgentProofGapWorkspace({
  cases,
  onSelectCase,
  onUpdateStage,
  setActiveTab,
  onCreateVault,
  routeCaseIds,
  setRouteCaseIds
}: {
  cases: Case[],
  onSelectCase: (id: string) => void,
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer', resNote?: string, resAgentName?: string) => void,
  setActiveTab: (tab: string) => void,
  onCreateVault: (id: string) => void,
  routeCaseIds: string[],
  setRouteCaseIds: (ids: string[]) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(cases[0]?.id || null);
  const selectedCase = cases.find((caseData) => caseData.id === selectedId) || cases[0];

  useEffect(() => {
    if (!selectedId && cases[0]) setSelectedId(cases[0].id);
  }, [cases, selectedId]);

  if (!selectedCase) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-500">
        <div className="text-center">
          <Smartphone className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p className="text-sm font-bold">No proof-gap tasks assigned.</p>
        </div>
      </div>
    );
  }

  const ensureInRoute = () => {
    if (!routeCaseIds.includes(selectedCase.id)) {
      setRouteCaseIds([...routeCaseIds, selectedCase.id]);
    }
  };

  return (
    <div className="grid h-full grid-cols-[360px_minmax(0,1fr)] overflow-hidden bg-slate-950 text-slate-100 max-lg:grid-cols-1 max-lg:overflow-y-auto">
      <aside className="border-r border-slate-800 bg-slate-900/50 max-lg:border-r-0">
        <div className="border-b border-slate-800 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">Agent workspace</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Proof gaps</h2>
          <p className="mt-2 text-xs font-medium leading-5 text-slate-400">Cases are framed as collection tasks, not generic dossiers.</p>
        </div>
        {cases.map((caseData) => (
          <button
            key={caseData.id}
            onClick={() => {
              setSelectedId(caseData.id);
              onSelectCase(caseData.id);
            }}
            className={cn("w-full border-b border-slate-800 px-6 py-5 text-left hover:bg-white/[0.03]", selectedCase.id === caseData.id && "bg-cyan-500/10")}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">{caseData.id}</p>
            <h3 className="mt-2 text-sm font-black text-white">{caseData.location.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{caseData.location.city} • ₹{(caseData.recoverableValue / 1000).toFixed(0)}k</p>
          </button>
        ))}
      </aside>

      <main className="overflow-y-auto p-8">
        <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-xl:grid-cols-1">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-7">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-400">{selectedCase.id} • assignment reason</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white">Fix venue and violation-source proof</h1>
            <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-400">
              Authority found a reviewable track match, but the evidence package needs field-level confirmation before Litigation can use it.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 max-md:grid-cols-1">
              <FactBadge label="Track proof" value={trackIdentityLabel(selectedCase)} tone={isTrackIdentified(selectedCase) ? 'green' : 'red'} />
              <FactBadge label="Venue proof" value={humanizeToken(getVenueAttributionSignal(selectedCase).status)} tone={evidenceToneFromStatus(getVenueAttributionSignal(selectedCase).status)} />
              <FactBadge label="Trust health" value={`${getTrustPassCount(selectedCase)}/5 gates`} tone={getTrustPassCount(selectedCase) >= 4 ? 'green' : 'amber'} />
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Route actions</p>
            <div className="mt-4 space-y-3">
              <button onClick={ensureInRoute} className="w-full rounded-lg bg-cyan-600 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-white">
                Add to route
              </button>
              <button onClick={() => onCreateVault(selectedCase.id)} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-300">
                Add evidence vault
              </button>
              <button
                onClick={() => {
                  onUpdateStage(selectedCase.id, 'Ready For Legal', undefined, 'Lawyer', 'Field proof added: venue identity and violation source context verified.', selectedCase.assignedTo);
                  setActiveTab('cases');
                }}
                className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-emerald-300"
              >
                Mark proof complete
              </button>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Required proof checklist</p>
          <div className="mt-5 grid gap-3">
            {[
              ['Exterior signage photo', 'Capture business name and entrance.', false],
              ['20 second interior context video', 'Show music source, speaker/DJ area, and public setting.', false],
              ['GPS at venue entrance', 'Start/end geolocation must align with selected venue.', selectedCase.trustGates.geofencingContinuity],
              ['Source classification note', 'Recorded playback source, PA system, DJ booth, TV/screen playback, or live performer.', false],
              ['Privacy constraints respected', 'Avoid unnecessary customer faces and private-party details.', true]
            ].map(([title, description, done]) => (
              <div key={String(title)} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-4 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                <div className={cn("flex h-7 w-7 items-center justify-center rounded-md border text-xs font-black", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-700 text-slate-500")}>
                  {done ? '✓' : '!'}
                </div>
                <div>
                  <p className="text-sm font-black text-white">{title}</p>
                  <p className="mt-1 text-xs text-slate-500">{description}</p>
                </div>
                <span className={cn("rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest", done ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>
                  {done ? 'Captured' : 'Required'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function LitigationClaimReadiness({
  allCases,
  onSelectCase,
  onUpdateStage,
  setActiveTab,
  onRunSignalAnalysis,
  onRunDemucs,
  runningSignalAnalysisIds,
  runningDemucsIds
}: {
  allCases: Case[],
  onSelectCase: (id: string) => void,
  onUpdateStage: (id: string, stage: CaseStage, notes?: string) => void,
  setActiveTab: (tab: string) => void,
  onRunSignalAnalysis: (caseId: string) => void,
  onRunDemucs: (caseId: string) => void,
  runningSignalAnalysisIds: Set<string>,
  runningDemucsIds: Set<string>
}) {
  const dossiers = useMemo(() => {
    const groups: Record<string, Case[]> = {};
    allCases
      .filter((caseData) => ['Ready For Legal', 'Recovery In Progress', 'Closed'].includes(caseData.stage))
      .forEach((caseData) => {
        groups[caseData.location.name] = [...(groups[caseData.location.name] || []), caseData];
      });
    return Object.entries(groups).map(([venueName, venueCases]) => ({
      venueName,
      cases: venueCases.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime()),
      totalValue: venueCases.reduce((sum, caseData) => sum + caseData.recoverableValue, 0),
      risk: venueCases.length > 3 ? 'High' : venueCases.length > 1 ? 'Medium' : 'Low'
    }));
  }, [allCases]);
  const [selectedVenue, setSelectedVenue] = useState<string | null>(dossiers[0]?.venueName || null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const currentDossier = dossiers.find((dossier) => dossier.venueName === selectedVenue) || dossiers[0];
  const currentCase = useMemo(() => {
    if (!currentDossier) {
      return null;
    }

    return currentDossier.cases.find((caseData) => caseData.id === selectedCaseId) || currentDossier.cases[0];
  }, [currentDossier, selectedCaseId]);

  useEffect(() => {
    if (!selectedVenue && dossiers[0]) setSelectedVenue(dossiers[0].venueName);
  }, [dossiers, selectedVenue]);

  if (!currentDossier || !currentCase) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-slate-500">
        <div className="text-center">
          <Gavel className="mx-auto mb-4 h-12 w-12 opacity-30" />
          <p className="text-sm font-bold">No claim-ready venues yet.</p>
        </div>
      </div>
    );
  }

  const venueProof = Math.min(94, 50 + currentCase.pastOffences * 10 + (currentCase.trustGates.geofencingContinuity ? 18 : 0));
  const licenseReady = currentCase.songAssessment.isrc && currentCase.songAssessment.rightsAssociation ? 82 : 42;
  const noticeReady = currentCase.qualityScore >= 75 && licenseReady > 70 && venueProof > 72;

  return (
    <div className="grid h-full grid-cols-[320px_minmax(0,1fr)_340px] overflow-hidden bg-slate-950 text-slate-100 max-lg:grid-cols-1 max-lg:overflow-y-auto">
      <aside className="border-r border-slate-800 bg-slate-900/50 max-lg:border-r-0">
        <div className="border-b border-slate-800 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-400">Litigation workspace</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">Venue dossiers</h2>
        </div>
        {dossiers.map((dossier) => (
          <button
            key={dossier.venueName}
            onClick={() => {
              setSelectedVenue(dossier.venueName);
              setSelectedCaseId(null);
            }}
            className={cn("w-full border-b border-slate-800 px-6 py-5 text-left hover:bg-white/[0.03]", currentDossier.venueName === dossier.venueName && "bg-purple-500/10")}
          >
            <div className="mb-2 flex gap-2">
              <span className={cn("rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest", dossier.risk === 'High' ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>{dossier.risk} risk</span>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{dossier.cases.length} cases</span>
            </div>
            <h3 className="text-sm font-black text-white">{dossier.venueName}</h3>
            <p className="mt-1 text-xs text-slate-500">₹{(dossier.totalValue / 1000).toFixed(0)}k potential</p>
          </button>
        ))}
      </aside>

      <main className="overflow-y-auto p-8">
        <section className="rounded-lg border border-slate-800 bg-slate-900 p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-purple-400">Legal sufficiency matrix</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white">Claim package</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-400">
            {noticeReady
              ? 'Evidence score, rights identifiers, and venue proof are strong enough to prepare external communication.'
              : 'Legal action should wait until evidence score, rights identifiers, or venue proof are stronger.'}
          </p>
          <div className="mt-6 grid grid-cols-3 gap-3 max-md:grid-cols-1">
            <FactBadge label="Evidence" value={trackIdentityLabel(currentCase)} tone={isTrackIdentified(currentCase) ? 'green' : 'amber'} />
            <FactBadge label="Rights" value={licenseReady > 70 ? 'Resolved' : 'Pending review'} tone={licenseReady > 70 ? 'green' : 'amber'} />
            <FactBadge label="Venue liability" value={humanizeToken(getVenueAttributionSignal(currentCase).status)} tone={evidenceToneFromStatus(getVenueAttributionSignal(currentCase).status)} />
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-7">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Draft legal recommendation</p>
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5">
            <p className="text-sm leading-6 text-slate-300">
              {noticeReady
                ? `Prepare a standard notice for ${currentDossier.venueName}. The evidence package ties ${currentCase.songAssessment.title} to a verified venue context with acceptable custody and rights identifiers.`
                : `Do not issue notice yet for ${currentDossier.venueName}. Track and rights signals are usable, but venue identity or violation-source proof should be strengthened before external communication.`}
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">ISRC {currentCase.songAssessment.isrc}</span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">{currentCase.songAssessment.rightsAssociation}</span>
            <span className="rounded-full border border-slate-700 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">{getTrustPassCount(currentCase)}/5 trust gates</span>
          </div>
        </section>

        <EvidenceMediaDossier caseData={currentCase} />
      </main>

      <aside className="border-l border-slate-800 bg-slate-900/50 p-6 max-lg:border-l-0">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Notice readiness</p>
        <div className="mt-4 space-y-3">
          {[
            ['Rights owner', true],
            ['Track identifiers', Boolean(currentCase.songAssessment.isrc)],
            ['License assessment', licenseReady > 70],
            ['Venue proof', venueProof > 72],
            ['Claim proportionality', currentCase.recoverableValue > 50000]
          ].map(([label, passed]) => (
            <div key={String(label)} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3">
              <span className="text-xs font-black text-white">{label}</span>
              <span className={cn("rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest", passed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>
                {passed ? 'Pass' : 'Open'}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          <button
            onClick={() => {
              onUpdateStage(currentCase.id, noticeReady ? 'Recovery In Progress' : 'Agent Assignment', noticeReady ? 'Litigation marked notice package ready.' : 'Litigation returned case: evidence package needs more proof.');
            }}
            className="w-full rounded-lg bg-purple-600 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-white"
          >
            {noticeReady ? 'Start recovery' : 'Return to Agent'}
          </button>
          <button onClick={() => { onSelectCase(currentCase.id); setActiveTab('cases'); }} className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-left text-xs font-black uppercase tracking-widest text-slate-300">
            Open authority view
          </button>
        </div>

        <div className="mt-6">
          <BackendAnalysisActions
            caseData={currentCase}
            onRunSignalAnalysis={onRunSignalAnalysis}
            onRunDemucs={onRunDemucs}
            isSignalAnalysisRunning={runningSignalAnalysisIds.has(currentCase.id)}
            isDemucsRunning={runningDemucsIds.has(currentCase.id)}
            compact
          />
        </div>

        <div className="mt-8 border-t border-slate-800 pt-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Venue cases</p>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
              {currentDossier.cases.length}
            </span>
          </div>
          <div className="space-y-3">
            {currentDossier.cases.map((caseData) => {
              const caseProfile = getDecisionProfile(caseData);
              return (
                <button
                  key={caseData.id}
                  onClick={() => {
                    setSelectedCaseId(caseData.id);
                    onSelectCase(caseData.id);
                  }}
                  className={cn(
                    "w-full rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left transition-colors hover:border-purple-500/30 hover:bg-purple-500/10",
                    currentCase.id === caseData.id && "border-purple-500/30 bg-purple-500/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black text-white">{caseData.id}</p>
                    <span className="text-[10px] font-black text-purple-300">{trackIdentityLabel(caseData)}</span>
                  </div>
                  <p className="mt-2 line-clamp-1 text-xs font-bold text-slate-300">{caseData.songAssessment.title}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">{caseProfile.action}</p>
                </button>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 text-label relative z-10",
        active ? "text-text-primary" : "text-text-tertiary hover:text-text-secondary"
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute inset-0 bg-white/5 rounded-md -z-10 shadow-sm"
          transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        />
      )}
      {icon}
      <span className="hidden md:block transition-opacity duration-200">{label}</span>
      {active && (
        <motion.div 
          layoutId="active-dot" 
          className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-500 hidden md:block" 
        />
      )}
    </button>
  );
}

function VenueResolutionQueue({ cases, onSelectCase }: { cases: Case[]; onSelectCase: (id: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'approximate' | 'unresolved'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(() => (
    cases
      .map((caseData) => ({ caseData, workflow: getWorkflowState(caseData) }))
      .filter(({ workflow }) => workflow.venueIdentity?.status !== 'RESOLVED')
      .filter(({ workflow }) => filter === 'all' || workflow.venueIdentity?.status.toLowerCase() === filter)
      .sort((left, right) => right.caseData.timestamp.getTime() - left.caseData.timestamp.getTime())
  ), [cases, filter]);
  const selected = rows.find((row) => row.caseData.id === selectedId) || rows[0] || null;

  return (
    <div className="grid h-full grid-cols-[380px_minmax(0,1fr)] overflow-hidden bg-slate-950 text-slate-100 max-lg:grid-cols-1 max-lg:overflow-y-auto">
      <aside className="border-r border-slate-800 bg-slate-900/50 max-lg:border-r-0">
        <div className="border-b border-slate-800 p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">Venue resolution</p>
          <h2 className="mt-2 text-2xl font-black text-white">Coordinate Review Queue</h2>
          <div className="mt-5 flex gap-2">
            {[
              ['all', 'All'],
              ['approximate', 'Approximate'],
              ['unresolved', 'Unresolved']
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as typeof filter)}
                className={cn(
                  "rounded-md border px-3 py-2 text-[10px] font-black uppercase tracking-widest",
                  filter === id ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-slate-800 bg-slate-950/60 text-slate-500"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[calc(100dvh - 11rem)] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="p-6">
              <PanelState type="empty" message="No unresolved or approximate venue captures match this filter." />
            </div>
          ) : rows.map(({ caseData, workflow }) => {
            const venue = workflow.venueIdentity;
            return (
              <button
                key={caseData.id}
                type="button"
                onClick={() => setSelectedId(caseData.id)}
                className={cn(
                  "w-full border-b border-slate-800 p-5 text-left transition-colors hover:bg-white/[0.03]",
                  selected?.caseData.id === caseData.id && "bg-amber-500/10"
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="font-mono text-[10px] font-black uppercase tracking-widest text-slate-500">{caseData.id}</span>
                  <VenueIdentityBadge workflow={workflow} />
                </div>
                <h3 className="text-sm font-black text-white">{venue?.coordinates ? `${venue.coordinates.lat.toFixed(4)}, ${venue.coordinates.lng.toFixed(4)}` : 'Coordinates unavailable'}</h3>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <QueueMetric label="Candidates" value={String(venue?.candidateVenueCount ?? 0)} />
                  <QueueMetric label="Best confidence" value={venue?.bestCandidateConfidence ? `${venue.bestCandidateConfidence}%` : 'n/a'} />
                  <QueueMetric label="Assignment" value={venue?.assignmentStatus || 'Unassigned'} />
                  <QueueMetric label="Follow-up" value={venue?.followUpStatus || 'Review'} />
                </div>
              </button>
            );
          })}
        </div>
      </aside>
      <main className="overflow-y-auto p-8">
        {!selected ? (
          <PanelState type="empty" message="No venue resolution item selected." />
        ) : (
          <VenueResolutionDetail caseData={selected.caseData} workflow={selected.workflow} onOpenCase={() => onSelectCase(selected.caseData.id)} />
        )}
      </main>
    </div>
  );
}

function QueueMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 p-2">
      <p className="text-[8px] font-black uppercase tracking-widest text-slate-600">{label}</p>
      <p className="mt-1 truncate text-[11px] font-bold text-slate-300">{value}</p>
    </div>
  );
}

function VenueResolutionDetail({ caseData, workflow, onOpenCase }: { caseData: Case; workflow: EnforcementWorkflowState; onOpenCase: () => void }) {
  const venue = workflow.venueIdentity;
  const coordinates = venue?.coordinates;
  const candidateConfidence = venue?.bestCandidateConfidence || 0;
  const candidates = [
    { name: caseData.location.name || 'Candidate venue', confidence: candidateConfidence, distance: '42 m' },
    { name: `${caseData.location.city} nearby venue`, confidence: Math.max(20, candidateConfidence - 18), distance: '91 m' },
    { name: 'Unmatched coordinate only', confidence: Math.max(10, candidateConfidence - 34), distance: 'n/a' }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-800 bg-slate-900 p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-400">{caseData.id}</p>
            <h1 className="mt-2 text-3xl font-black text-white">Resolve Venue Identity</h1>
            <p className="mt-2 text-sm font-bold text-slate-500">{coordinates ? `${coordinates.lat}, ${coordinates.lng}` : 'Missing or invalid coordinates'}</p>
          </div>
          <button onClick={onOpenCase} className="rounded-md border border-slate-700 bg-slate-950 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-300 hover:border-blue-500/40">
            Open Capture Details
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          {coordinates ? (
            <MapContainer center={[coordinates.lat, coordinates.lng]} zoom={15} className="h-[300px] md:h-[420px] w-full">
              <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[coordinates.lat, coordinates.lng]}>
                <Popup>Capture coordinates</Popup>
              </Marker>
              {candidates.slice(0, 2).map((candidate, index) => (
                <CircleMarker
                  key={candidate.name}
                  center={[coordinates.lat + (index + 1) * 0.001, coordinates.lng - (index + 1) * 0.001]}
                  radius={index === 0 ? 10 : 7}
                  pathOptions={{ color: index === 0 ? '#22c55e' : '#f59e0b' }}
                >
                  <Popup>{candidate.name} · {candidate.confidence}%</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          ) : (
            <div className="flex h-[420px] items-center justify-center">
              <PanelState type="error" message="Coordinates are missing or invalid for this capture." />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {candidates.map((candidate, index) => (
            <div key={candidate.name} className={cn(
              "rounded-lg border p-4",
              index === 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-slate-800 bg-slate-900"
            )}>
              <p className="text-sm font-black text-white">{candidate.name}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">{candidate.distance} · {candidate.confidence}% confidence</p>
              <div className="mt-4 flex gap-2">
                <button className="flex-1 rounded-md bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white">Confirm</button>
                <button className="flex-1 rounded-md border border-slate-700 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-300">Reject</button>
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Field notes</label>
            <textarea className="h-24 w-full resize-none rounded-md border border-slate-800 bg-slate-950 p-3 text-sm font-bold text-white outline-none" placeholder="Add venue resolution notes" />
            <button className="mt-3 w-full rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-200">
              Assign Follow-Up
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReportsDashboard({ allCases }: { allCases: Case[] }) {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] } }
  };

  const stats = useMemo(() => {
    const totalValue = allCases.reduce((sum, c) => sum + (c.recoverableValue || 0), 0);
    const recoveredValue = allCases.filter(c => c.stage === 'Closed').reduce((sum, c) => sum + (c.recoverableValue || 0), 0);
    const totalExpectedFines = allCases.reduce((sum, c) => sum + (c.expectedFine || 0), 0);
    // qualityScore has no model behind it in production; the real fleet-wide
    // metric is the share of cases with an identified track, a literal count
    // -> percentage, not a synthesized average of fabricated per-case scores.
    const identifiedShare = allCases.length
      ? Math.round((allCases.filter(isTrackIdentified).length / allCases.length) * 100)
      : 0;
    
    // Monthly Distribution
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyAcc = allCases.reduce((acc, c) => {
      const monthIdx = new Date(c.timestamp).getMonth();
      const month = months[monthIdx];
      if (!acc[month]) acc[month] = { month, cases: 0, revenue: 0 };
      acc[month].cases += 1;
      acc[month].revenue += c.recoverableValue || 0;
      return acc;
    }, {} as Record<string, { month: string, cases: number, revenue: number }>);

    const trendData = Object.values(monthlyAcc).sort((a,b) => months.indexOf(a.month) - months.indexOf(b.month));

    // Label Distribution
    const labelAcc = allCases.reduce((acc, c) => {
      acc[c.musicLabel] = (acc[c.musicLabel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const labelData = Object.entries(labelAcc).map(([name, value]) => ({ name, value }));

    // City Performance
    const cityAcc = allCases.reduce((acc, c) => {
      acc[c.location.city] = (acc[c.location.city] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const cityChartData = Object.entries(cityAcc)
      .map(([name, value]) => ({ name, value }))
      .sort((a,b) => b.value - a.value);

    // Agent Rankings
    const agentAcc = allCases.reduce((acc, c) => {
      if (!c.assignedTo) return acc;
      if (!acc[c.assignedTo]) acc[c.assignedTo] = { name: c.assignedTo, cases: 0, completed: 0, revenue: 0 };
      acc[c.assignedTo].cases += 1;
      if (c.stage === 'Closed' || c.agentActionTaken) acc[c.assignedTo].completed += 1;
      acc[c.assignedTo].revenue += c.recoverableValue || 0;
      return acc;
    }, {} as Record<string, { name: string, cases: number, completed: number, revenue: number }>);
    const agentRankings = Object.values(agentAcc).sort((a,b) => b.completed - a.completed);

    // Trust Gate Failures
    const gateFailures = {
      mediaHashKey: 0,
      payloadSignature: 0,
      clockSkewDetection: 0,
      geofencingContinuity: 0,
      deviceTrustBand: 0
    };
    allCases.forEach(c => {
      Object.entries(c.trustGates).forEach(([gate, passed]) => {
        if (!passed) gateFailures[gate as keyof typeof gateFailures] += 1;
      });
    });
    const gateData = Object.entries(gateFailures).map(([name, value]) => ({ 
      name: name.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()), 
      value 
    }));

    return { 
      totalValue, 
      recoveredValue, 
      totalExpectedFines,
      identifiedShare,
      trendData,
      labelData, 
      cityChartData, 
      agentRankings,
      gateData
    };
  }, [allCases]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6 lg:p-10">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="max-w-[1600px] mx-auto space-y-10"
      >
        {/* Header Section */}
        <motion.header variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Intelligence Matrix v4.2</h2>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-4">
              Operational Analytics
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-mono text-slate-400">
                FY 2024-25
              </span>
            </h1>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-6 py-3 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all group">
              <TrendingUp className="w-3.5 h-3.5 group-hover:text-blue-400" />
              Historical Comparison
            </button>
            <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">
              <ExternalLink className="w-3.5 h-3.5" />
              Generate Dossier
            </button>
          </div>
        </motion.header>

        {/* Global Key Metrics */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            label="Gross Recoverable" 
            value={`₹${(stats.totalValue / 100000).toFixed(2)}L`} 
            trend="+12.4%" 
            icon={<IndianRupee className="w-5 h-5 text-blue-400" />} 
            description="Total potential enforcement value"
          />
          <StatCard 
            label="Realized Revenue" 
            value={`₹${(stats.recoveredValue / 100000).toFixed(2)}L`} 
            trend="+8.1%" 
            icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />} 
            description="Settled and closed cases"
          />
          <StatCard
            label="Track Identification Rate"
            value={`${stats.identifiedShare}%`}
            trend="-2.4%"
            icon={<Activity className="w-5 h-5 text-purple-400" />}
            description="Share of cases with an identified track"
          />
          <StatCard 
            label="Infraction Density" 
            value={`${allCases.length}`} 
            trend="+5%" 
            icon={<AlertCircle className="w-5 h-5 text-red-400" />} 
            description="Active files in investigation"
          />
        </motion.div>

        {/* Primary Data Visuals */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Trend Chart */}
          <div className="lg:col-span-2 bg-slate-900/50 rounded-[32px] p-8 border border-white/5 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Infraction Velocity</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Monthly Case Load vs Revenue Projection</p>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Revenue</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-700" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cases</span>
                </div>
              </div>
            </div>
            
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', fontSize: '10px' }}
                    itemStyle={{ fontWeight: '900', textTransform: 'uppercase' }}
                  />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} />
                  <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="cases" stroke="#64748b" strokeWidth={2} fillOpacity={0.1} fill="#64748b" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Rights Holder Breakdown */}
          <div className="bg-slate-900/50 rounded-[32px] p-8 border border-white/5 flex flex-col">
            <div className="mb-8">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Rights Distribution</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Catalog exposure by Major Labels</p>
            </div>
            
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.labelData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats.labelData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.2)" />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 w-full mt-6">
                {stats.labelData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Secondary Insights Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
          
          {/* Top Cities */}
          <div className="bg-slate-900/50 rounded-[32px] p-8 border border-white/5 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Target Hubs</h3>
              <MapIcon className="w-4 h-4 text-slate-600" />
            </div>
            <div className="space-y-4">
              {stats.cityChartData.slice(0, 5).map((city, idx) => (
                <div key={city.name} className="flex items-center gap-4">
                  <span className="text-[10px] font-mono text-slate-700 w-4">0{idx + 1}</span>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-end">
                      <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">{city.name}</span>
                      <span className="text-[9px] font-bold text-slate-500">{city.value} Cases</span>
                    </div>
                    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full" 
                        style={{ width: `${(city.value / allCases.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Leaderboard */}
          <div className="lg:col-span-2 bg-slate-900/50 rounded-[32px] p-8 border border-white/5 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-widest">Enforcement Champions</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Performance metrics for Field Operations</p>
              </div>
              <button className="text-[9px] font-black text-brand-indigo uppercase tracking-widest hover:text-white transition-colors">View All Fleet</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="pb-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Rank</th>
                    <th className="pb-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Agent Entity</th>
                    <th className="pb-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Operations</th>
                    <th className="pb-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Resolutions</th>
                    <th className="pb-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Yield</th>
                    <th className="pb-4 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {stats.agentRankings.slice(0, 4).map((agent, idx) => (
                    <tr key={agent.name} className="group transition-colors hover:bg-white/[0.02]">
                      <td className="py-4">
                        <div className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold",
                          idx === 0 ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "text-slate-600"
                        )}>
                          {idx === 0 ? <Trophy className="w-3 h-3" /> : idx + 1}
                        </div>
                      </td>
                      <td className="py-4">
                        <p className="text-xs font-black text-slate-300 uppercase tracking-tight">{agent.name}</p>
                        <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">Fleet ID: AGENT-{(idx + 1) * 123}</p>
                      </td>
                      <td className="py-4">
                        <span className="text-[10px] font-mono text-slate-400">{agent.cases} Files</span>
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-white">{agent.completed}</span>
                          <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${(agent.completed / agent.cases) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="text-[10px] font-mono text-emerald-400">₹{(agent.revenue / 1000).toFixed(1)}k</span>
                      </td>
                      <td className="py-4 text-right">
                        <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase rounded tracking-widest border border-emerald-500/20">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Trust Matrix Breakdown */}
          <div className="bg-slate-900/50 rounded-[32px] p-8 border border-white/5 space-y-6">
            <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-400" />
              Forensic Integrity
            </h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
              Detection of failed security gates across all field operations. Identifying systemic hardware or spoofing trends.
            </p>
            <div className="space-y-5">
              {stats.gateData.map(gate => (
                <div key={gate.name} className="flex items-center gap-4">
                  <span className="flex-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{gate.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-red-400">{gate.value}</span>
                    <AlertCircle className={cn("w-3 h-3", gate.value > 0 ? "text-red-500" : "text-slate-700")} />
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-white/5">
              <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <Target className="w-3 h-3" />
                System Reliability: 98.4%
              </p>
            </div>
          </div>

        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ label, value, trend, icon, description }: { label: string, value: string, trend: string, icon: React.ReactNode, description: string }) {
  const isPositive = trend.startsWith('+');
  return (
    <div className="bg-slate-900/50 rounded-3xl p-8 border border-white/5 space-y-4 group hover:border-white/10 transition-all">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className={cn(
          "px-2 py-0.5 rounded-lg text-[10px] font-black border",
          isPositive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
        )}>
          {trend}
        </div>
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
        <div className="text-3xl font-black text-white tracking-tighter mt-1">{value}</div>
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-2">{description}</p>
      </div>
    </div>
  );
}

function FilterButton({ active, onClick, icon, label, order }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, order: 'asc' | 'desc' | null }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-tiny font-semibold transition-all border",
        active 
          ? "bg-white/10 text-text-primary border-white/20" 
          : "bg-white/[0.02] text-text-tertiary border-border-standard hover:border-border-subtle hover:bg-white/[0.04]"
      )}
    >
      {icon}
      {label}
      {active && (
        <ArrowUpDown className={cn("w-3 h-3 transition-transform", order === 'asc' ? "rotate-180" : "")} />
      )}
    </button>
  );
}

function CaseListItem({ caseData, isSelected, onClick }: { caseData: Case, isSelected: boolean, onClick: () => void, key?: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full text-left p-5 border-b border-border-subtle transition-all relative group",
        isSelected ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
      )}
    >
      {isSelected && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-violet" />}
      {caseData.unreadMajorChanges && (
        <span className="w-2.5 h-2.5 bg-red-500 rounded-full absolute top-5 right-2 shadow-lg shadow-red-500/50 animate-pulse border-2 border-bg-panel z-10" />
      )}
      {caseData.unreadComments && !caseData.unreadMajorChanges && (
        <span className="w-2 h-2 bg-accent-violet rounded-full absolute top-5 right-2 shadow-lg shadow-accent-violet/50 border border-bg-panel z-10" />
      )}
      <div className="flex justify-between items-start mb-2">
        <span className="text-tiny font-black text-text-quaternary group-hover:text-accent-violet transition-colors uppercase tracking-widest">{caseData.id}</span>
        <span className="text-tiny text-text-quaternary font-bold">{format(caseData.timestamp, 'HH:mm')}</span>
      </div>
      
      <div className="flex items-center gap-2 mb-2">
        <h3 className={cn("text-caption font-semibold truncate flex-1 tracking-tight", isSelected ? "text-text-primary" : "text-text-secondary")}>
          {caseData.location.name}
        </h3>
        {caseData.isNew && (
          <span className="px-1.5 py-0.5 bg-red-600 text-white text-[8px] font-black rounded uppercase tracking-widest animate-pulse">NEW</span>
        )}
      </div>

      <div className="flex items-center gap-3 text-tiny text-text-tertiary font-bold mb-4">
        <div className="flex items-center gap-1">
          <MapPin className="w-3 h-3 text-text-quaternary" />
          {caseData.location.city}
        </div>
        <div className="flex items-center gap-1">
          <Music className="w-3 h-3 text-text-quaternary" />
          {caseData.musicLabel}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-text-primary font-black text-caption">
          <IndianRupee className="w-3 h-3 text-text-quaternary" />
          {caseData.expectedFine.toLocaleString()}
        </div>
        <div className={cn(
          "px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest",
          caseData.stage === 'New' ? "bg-blue-900/40 text-blue-400 border border-blue-800" : 
          caseData.stage === 'Under Review' ? "bg-amber-900/40 text-amber-400 border border-amber-800" : 
          caseData.stage === 'Agent Assignment' ? "bg-cyan-900/40 text-cyan-400 border border-cyan-800" :
          caseData.stage === 'Ready For Legal' ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800" :
          caseData.stage === 'Recovery In Progress' ? "bg-purple-900/40 text-purple-400 border border-purple-800" :
          "bg-slate-900/40 text-slate-400 border border-slate-800"
        )}>
          {caseData.stage}
        </div>
      </div>
    </button>
  );
}

const formatContractToken = (value?: unknown) => (
  humanizeToken(value == null || value === '' ? 'unknown' : String(value))
    .replace(/\b\w/g, (char) => char.toUpperCase())
);

const getResolutionTone = (status?: string | null) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'resolved') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (normalized === 'pending_analyst_review') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-slate-700 bg-slate-950/60 text-slate-300';
};

// Loose accessors for the raw Phase 2 passthrough (caseData.analysis is typed
// `unknown` field-by-field on purpose — see CaseAnalysis). These never throw
// on missing/malformed data; absence renders an honest "not run yet" state
// instead of crashing the drill-down tabs.
const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function IntegrityEvidenceDetail({ caseData }: { caseData: Case }) {
  const g = caseData.trustGates;
  const rows: [string, boolean, string][] = [
    ['Media hash present', Boolean(g.mediaHashKey), 'A SHA-256 hash of the raw capture was recorded at upload.'],
    ['Payload signature verified', Boolean(g.payloadSignature), "The device's signed payload matched its enrolled signing key."],
    ['GPS track signed', Boolean(g.gpsTrackSigned), 'The GPS track hash was included in the signed payload — any post-signing tamper would be caught.'],
    ['Venue committed pre-capture', Boolean(g.venueCommitted), 'A venue was locked before recording started and could not be changed after the fact.'],
    ['Geofencing continuity', Boolean(g.geofencingContinuity), 'A continuous GPS track was captured during the recording window.'],
    ['Clock skew check', Boolean(g.clockSkewDetection), 'Not computed by the pipeline.'],
  ];
  return (
    <div className="space-y-2">
      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Why this integrity verdict</p>
      {rows.map(([label, ok, detail]) => (
        <div key={label} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
          {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
          <div>
            <p className={cn("text-xs font-bold", ok ? "text-slate-200" : "text-slate-500")}>{label}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function SongEvidenceDetail({ caseData, analysis }: { caseData: Case; analysis: Record<string, unknown> }) {
  const identified = Boolean(caseData.songAssessment.title) && caseData.songAssessment.title !== 'Unknown Track';
  const deconstruction = asRecord(analysis.audio_deconstruction);
  const attempts = asArray(deconstruction?.fingerprintAttempts) as Record<string, unknown>[];
  const artifacts = caseData.audioDeconstruction?.artifacts || [];

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        {identified ? 'Why this song was identified' : 'Why this song was not identified — listen to confirm manually'}
      </p>
      {identified ? (
        <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
          <div><p className="text-[10px] text-slate-500">Title</p><p className="font-bold text-white">{caseData.songAssessment.title}</p></div>
          <div><p className="text-[10px] text-slate-500">Artist</p><p className="font-bold text-white">{caseData.songAssessment.artists.join(', ') || '—'}</p></div>
          <div><p className="text-[10px] text-slate-500">Label</p><p className="font-bold text-white">{caseData.musicLabel || '—'}</p></div>
          <div><p className="text-[10px] text-slate-500">Rights</p><p className="font-bold text-white">{caseData.songAssessment.rightsAssociation || 'Pending'}</p></div>
        </div>
      ) : (
        <p className="text-xs text-slate-400">No confident audio fingerprint match was returned. Listen to the stems below to identify manually.</p>
      )}

      {attempts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Fingerprint attempts</p>
          {attempts.map((attempt, index) => (
            <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px]">
              <span className="text-slate-400">{String(attempt.stem)} · {String(attempt.passLabel)} pass · {Number(attempt.startSeconds)}s–{Number(attempt.endSeconds)}s</span>
              <span className={attempt.ok ? "text-emerald-400" : "text-red-400"}>{attempt.ok ? 'matched' : String(attempt.error || 'no match')}</span>
            </div>
          ))}
        </div>
      )}

      {artifacts.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Listen to isolated stems</p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {artifacts.map((artifact) => (
              <div key={artifact.assetId} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">{formatStemLabel(artifact.stem)}</p>
                <audio controls preload="none" className="h-8 w-full">
                  <source src={artifact.url} type={artifact.mimeType || 'audio/wav'} />
                </audio>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-500">No stems available yet — run advanced processing to separate audio for manual listening.</p>
      )}
    </div>
  );
}

function VenueEvidenceDetail({ caseData, analysis }: { caseData: Case; analysis: Record<string, unknown> }) {
  const vrr = asRecord(analysis.venue_resolution_review);
  if (!vrr) {
    return <p className="text-xs text-slate-500">No venue resolution review has run yet — run advanced processing (Phase 2) to populate this.</p>;
  }
  const signals = asRecord(vrr.signalsAvailable);
  const delta = asRecord(vrr.locationDelta);
  const discrepancy = asRecord(vrr.discrepancy);
  const candidates = asArray(vrr.nearbyVenueCandidates) as Record<string, unknown>[];
  const closestAlternate = asRecord(delta?.closestAlternateVenueCandidate);

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Why this venue verdict</p>
      <p className="text-xs leading-5 text-slate-300">
        Declared venue: <span className="font-bold text-white">{caseData.location.name}</span>.{' '}
        System recommendation: <span className="font-bold text-white">{formatContractToken(vrr.recommendation)}</span>.
        {discrepancy?.flagged ? <> <span className="text-red-300">{String(discrepancy.note)}</span></> : null}
      </p>

      <div className="grid grid-cols-2 gap-3 text-[11px] lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">Selected venue distance</p>
          <p className="font-bold text-white">{delta?.selectedVenueDistanceMeters != null ? `${delta.selectedVenueDistanceMeters}m` : '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">GPS accuracy</p>
          <p className="font-bold text-white">{delta?.accuracyMeters != null ? `${delta.accuracyMeters}m` : '—'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">WiFi signal</p>
          <p className="font-bold text-white">{signals?.wifiSsid ? String(signals.wifiSsid) : 'Not captured'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">Visual signage</p>
          <p className="font-bold text-white">{signals?.visualSignage ? 'Present' : 'None'}</p>
        </div>
      </div>

      {delta?.adjacentVenueAmbiguity ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200">
          Nearby venue ambiguity: <span className="font-bold">{String(closestAlternate?.name || 'an unnamed venue')}</span> is only {String(delta.closestAlternateDeltaMeters)}m closer than the declared venue.
        </div>
      ) : null}

      {candidates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Candidate venues scored</p>
          {candidates.slice(0, 5).map((candidate, index) => (
            <div key={index} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px]">
              <span className={cn("font-bold", candidate.isUserSelected ? "text-blue-300" : "text-slate-300")}>
                {String(candidate.name)}{candidate.isUserSelected ? ' (selected)' : ''}
              </span>
              <span className="text-slate-500">
                {Math.round(Number(candidate.distanceMeters) || 0)}m · support {Number(candidate.support || 0).toFixed(2)} ·{' '}
                {asArray(candidate.signals).map((s) => String(asRecord(s)?.signal)).join(', ') || 'no signals'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceEvidenceDetail({ analysis }: { analysis: Record<string, unknown> }) {
  const source = asRecord(analysis.source_analysis);
  const visual = asRecord(analysis.visual_analysis);
  const explanation = asArray(source?.explanation) as string[];
  const equipment = asArray(visual?.visibleEquipment) as string[];
  const venueCues = asArray(visual?.venueIdentitySignals) as string[];
  const signageText = String(asRecord(visual?.signageOcr)?.detectedSignageText || '');

  if (!source && !visual) {
    return <p className="text-xs text-slate-500">No source/visual analysis has run yet — run advanced processing (Phase 2) to populate this.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Why this source verdict</p>
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">Audio classifier (deterministic)</p>
          <p className="font-bold text-white">{source ? formatContractToken(source.sourceClass) : 'Not run'}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">Visual AI (Groq vision)</p>
          <p className="font-bold text-white">{visual ? formatContractToken(visual.playbackContext) : 'Not run'}</p>
        </div>
      </div>
      {explanation.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Audio classifier reasoning</p>
          {explanation.map((line, index) => <p key={index} className="text-[11px] text-slate-400">• {line}</p>)}
        </div>
      )}
      {visual?.summary ? <p className="text-[11px] leading-5 text-slate-400">{String(visual.summary)}</p> : null}
      {(equipment.length > 0 || venueCues.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {[...equipment, ...venueCues].map((cue, index) => (
            <span key={index} className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{cue}</span>
          ))}
        </div>
      )}
      {signageText && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-[11px] text-slate-300">
          Signage read (blind OCR, never told the venue name): "{signageText}"
        </div>
      )}
    </div>
  );
}

// Replaces the static compact-card strip with clickable tabs — each opens the
// real evidence behind that verdict instead of just restating the label.
function EvidenceDrilldownTabs({ caseData }: { caseData: Case }) {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const narrative = caseData.contract?.narrative || [];
  const tabIds = ['integrity', 'song', 'venue', 'source'] as const;
  const tabs = tabIds
    .map((id) => narrative.find((line) => line.id === id))
    .filter((line): line is CaseNarrativeLine => Boolean(line));
  const analysis = (caseData.analysis || {}) as Record<string, unknown>;

  if (!tabs.length) return null;

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tabs.map((line) => {
          const isActive = activeTab === line.id;
          return (
            <button
              key={line.id}
              type="button"
              onClick={() => setActiveTab(isActive ? null : line.id)}
              className={cn(
                "rounded-2xl border p-4 text-left transition-colors",
                isActive ? "border-blue-500/50 bg-blue-500/10"
                  : line.tone === 'green' ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
                    : line.tone === 'red' ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
                      : line.tone === 'amber' ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                        : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{formatContractToken(line.id)}</p>
                <ChevronDown className={cn("h-3 w-3 text-slate-500 transition-transform", isActive && "rotate-180")} />
              </div>
              <p className={cn(
                "mt-1 text-sm font-black",
                line.tone === 'green' ? "text-emerald-300" : line.tone === 'red' ? "text-red-300" : line.tone === 'amber' ? "text-amber-300" : "text-slate-400"
              )}>{line.label}</p>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {activeTab && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
              {activeTab === 'integrity' && <IntegrityEvidenceDetail caseData={caseData} />}
              {activeTab === 'song' && <SongEvidenceDetail caseData={caseData} analysis={analysis} />}
              {activeTab === 'venue' && <VenueEvidenceDetail caseData={caseData} analysis={analysis} />}
              {activeTab === 'source' && <SourceEvidenceDetail analysis={analysis} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Raw video, shown first — before any verdict or narrative. Deliberately
// minimal (no audio-toggle/waveform chrome) to keep the detail view condensed;
// EvidenceMediaDossier (the fuller dossier) was dead code with zero call sites.
function RawVideoPanel({ caseData }: { caseData: Case }) {
  const videoUrl = caseData.videoProofUrl || caseData.absoluteProof.smallVideoUrl;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-black">
      {videoUrl ? (
        <video controls preload="metadata" src={videoUrl} className="aspect-video max-h-[420px] w-full bg-black object-contain" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-slate-950 text-xs font-bold uppercase tracking-widest text-slate-600">
          No video attached
        </div>
      )}
      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-4 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Raw capture</p>
        <p className="text-[10px] font-medium text-slate-500">{format(caseData.timestamp, 'MMM d, yyyy HH:mm')}</p>
      </div>
    </div>
  );
}

function ReviewReadinessPanel({ caseData }: { caseData: Case }) {
  const contract = caseData.contract;
  if (!contract) return null;

  const readiness = contract.crm_readiness;
  const licenseVerdict = contract.license_verdict;
  const analystActions = readiness?.analyst_required_actions || [];
  const missingFields = readiness?.missing_resolution_fields || [];
  // Matched Track and Venue are already covered by the Song/Venue drilldown
  // tabs rendered just above — only show fields the tabs don't surface.
  const resolutionEntries = [
    ['Rights Owner', contract.resolutions?.rights_owner],
    ['Merchant', contract.resolutions?.merchant],
  ] as const;

  const exportLine = contract.narrative?.find((line) => line.id === 'export');
  const exportBlockerLabels: Record<string, string> = {
    ownership: 'Resolve Rights Owner',
    merchant: 'Resolve Merchant',
    license: 'Run License Check',
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-blue-400">Review readiness</p>
          <h3 className="mt-1 text-xl font-black text-white">
            {readiness?.is_case_ready ? 'Case is reviewable' : 'Resolution required'}
          </h3>
          <p className="mt-1 max-w-3xl text-xs font-medium leading-5 text-slate-400">
            {contract.ai_review_brief?.one_line || caseData.aiExplanation || 'Backend contract attached without a review brief.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-right">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Processing</p>
            <p className="mt-1 text-xs font-black text-white">{formatContractToken(contract.processing_stage)}</p>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">License</p>
            <p className="mt-1 text-xs font-black text-white">{formatContractToken(licenseVerdict?.status)}</p>
          </div>
        </div>
      </div>

      {/* Clickable evidence tabs — click Integrity/Song/Venue/Source to see the
          actual evidence behind that verdict, not just the headline label. */}
      <div className="mt-5">
        <EvidenceDrilldownTabs caseData={caseData} />
      </div>

      {/* Integrity/Song/Venue/Source are now covered by the clickable tabs
          above — only the remaining narrative lines render here, so nothing
          is said twice. */}
      {(() => {
        const remaining = (contract.narrative || []).filter(
          (line) => !['integrity', 'song', 'venue', 'source'].includes(line.id)
        );
        return remaining.length > 0 && (
          <div className="mt-5 space-y-2">
            {remaining.map((line) => (
              <div key={line.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <span className={cn(
                  "mt-0.5 h-2 w-2 shrink-0 rounded-full",
                  line.tone === 'green' ? "bg-emerald-400" : line.tone === 'amber' ? "bg-amber-400" : line.tone === 'red' ? "bg-red-400" : "bg-slate-500"
                )} />
                <p className="text-sm font-medium leading-5 text-slate-200">{line.text}</p>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {resolutionEntries.map(([label, resolution]) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
              <span className={cn("rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-widest", getResolutionTone(resolution?.status))}>
                {formatContractToken(resolution?.status)}
              </span>
            </div>
            <p className="mt-3 text-xs font-bold text-slate-300">{formatContractToken(resolution?.reason)}</p>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-600">
              Owner: <span className="text-slate-400">{formatContractToken(resolution?.owner)}</span>
            </p>
          </div>
        ))}
      </div>

      {!!exportLine?.blockers?.length && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Export blockers</p>
          <div className="mt-3 space-y-2">
            {exportLine.blockers.map((blocker, index) => (
              <div key={blocker} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <p className="text-xs font-bold text-amber-200">
                  {index + 1}. {formatContractToken(blocker)} unresolved
                </p>
                <button
                  type="button"
                  disabled
                  title="Not yet wired — no backend endpoint exists for this action yet."
                  className="cursor-not-allowed rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500"
                >
                  {exportBlockerLabels[blocker] || `Resolve ${formatContractToken(blocker)}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(analystActions.length > 0 || missingFields.length > 0 || licenseVerdict?.reason) && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Case model</p>
            <p className="mt-2 text-sm font-black text-white">{formatContractToken(readiness?.case_model)}</p>
            <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{readiness?.case_grouping_key || caseData.id}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Analyst actions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(analystActions.length ? analystActions : ['none']).map((action) => (
                <span key={action} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-widest text-amber-300">
                  {formatContractToken(action)}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Missing fields</p>
            <p className="mt-2 text-sm font-black text-white">
              {missingFields.length ? missingFields.map(formatContractToken).join(', ') : 'None'}
            </p>
            {licenseVerdict?.reason && (
              <p className="mt-2 text-[10px] font-bold text-slate-500">{formatContractToken(licenseVerdict.reason)}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// TEMPORARY: dumps every Phase 2 analysis section the server now emits, raw.
// Purpose is to make the full pipeline output visible end-to-end before we
// design dedicated UI for each section. Replace with structured panels later.
const riskBucket = (value: unknown): { label: string; tone: 'green' | 'amber' | 'red' } => {
  const n = Number(value);
  if (!Number.isFinite(n)) return { label: 'Unknown', tone: 'amber' };
  if (n >= 0.6) return { label: 'High', tone: 'red' };
  if (n >= 0.3) return { label: 'Medium', tone: 'amber' };
  return { label: 'Low', tone: 'green' };
};

function ApplicationAssessmentSection({ assessment }: { assessment: Record<string, unknown> }) {
  const allRisks: [string, unknown][] = [
    ['Venue attribution risk', assessment.venueAttributionRisk],
    ['Private space risk', assessment.privateSpaceRisk],
    ['Replay risk', assessment.replayRisk],
    ['Outlet ambiguity risk', assessment.outletAmbiguityRisk],
    ['Farming risk', assessment.farmingRisk],
  ];
  const risks = allRisks.filter(([, value]) => value != null);
  const reasons = asArray(assessment.reasons) as string[];
  const evidenceGaps = asArray(assessment.evidenceGaps) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-300">
          {formatContractToken(assessment.locationContext)}
        </span>
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-300">
          Recommends: {formatContractToken(assessment.recommendedDisposition)}
        </span>
      </div>

      {risks.length > 0 && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          {risks.map(([label, value]) => {
            const bucket = riskBucket(value);
            return (
              <div key={label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-center">
                <p className="text-[9px] font-bold uppercase leading-tight text-slate-500">{label}</p>
                <p className={cn(
                  "mt-1 text-xs font-black",
                  bucket.tone === 'green' ? "text-emerald-300" : bucket.tone === 'red' ? "text-red-300" : "text-amber-300"
                )}>{bucket.label}</p>
              </div>
            );
          })}
        </div>
      )}

      {reasons.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Why this assessment</p>
          {reasons.map((reason, index) => <p key={index} className="text-[11px] text-slate-400">• {reason}</p>)}
        </div>
      )}
      {evidenceGaps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Evidence gaps</p>
          {evidenceGaps.map((gap, index) => <p key={index} className="text-[11px] text-amber-300/80">• {gap}</p>)}
        </div>
      )}
    </div>
  );
}

function ContextReconciliationSection({ reconciliation }: { reconciliation: Record<string, unknown> }) {
  const declared = asRecord(reconciliation.declared);
  const mismatchFlags = asArray(reconciliation.mismatchFlags) as string[];
  const agreement = String(reconciliation.agreement || '');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-700 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-300">
          {formatContractToken(reconciliation.spaceClass)}
        </span>
        <span className={cn(
          "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest",
          agreement === 'aligned' ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"
        )}>
          Declared vs. detected: {formatContractToken(agreement)}
        </span>
      </div>

      {declared && (
        <div className="grid grid-cols-2 gap-2 text-[11px] lg:grid-cols-5">
          {Object.entries(declared).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
              <p className="text-slate-500">{formatContractToken(key)}</p>
              <p className="font-bold text-white">{formatContractToken(value)}</p>
            </div>
          ))}
        </div>
      )}

      {mismatchFlags.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">Mismatches flagged</p>
          {mismatchFlags.map((flag, index) => <p key={index} className="text-[11px] text-amber-300/80">• {formatContractToken(flag)}</p>)}
        </div>
      )}
      {reconciliation.reviewReason ? (
        <p className="text-[11px] text-slate-400">Review reason: {String(reconciliation.reviewReason)}</p>
      ) : null}
    </div>
  );
}

function AiReviewBriefSection({ brief }: { brief: Record<string, unknown> }) {
  const agreements = asArray(brief.agreements) as string[];
  const conflicts = asArray(brief.conflicts) as string[];
  const unresolved = asArray(brief.unresolved) as string[];

  return (
    <div className="space-y-3">
      {agreements.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400/80">Signals agree</p>
          {agreements.map((line, index) => <p key={index} className="text-[11px] text-slate-300">• {line}</p>)}
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/80">Signals conflict</p>
          {conflicts.map((line, index) => <p key={index} className="text-[11px] text-slate-300">• {line}</p>)}
        </div>
      )}
      {unresolved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {unresolved.map((field) => (
            <span key={field} className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">{formatContractToken(field)} unresolved</span>
          ))}
        </div>
      )}
      <p className="text-[10px] italic text-slate-600">{String(brief.caveat || '')} — {formatContractToken(brief.model)}</p>
    </div>
  );
}

function RadioContextSection({ radioContext }: { radioContext: Record<string, unknown> | null }) {
  if (!radioContext) {
    return (
      <p className="text-[11px] font-medium leading-5 text-slate-500">
        Not captured for this submission — most likely an Expo Go capture (Wi-Fi/BLE collection requires a native build).
      </p>
    );
  }
  const endSnapshot = asRecord(radioContext.end) || asRecord(radioContext.start);
  const wifi = asRecord(endSnapshot?.wifi);
  const bluetooth = asRecord(endSnapshot?.bluetooth);
  const devices = (asArray(bluetooth?.devices) as Record<string, unknown>[])
    .filter((device) => device.displayName || device.manufacturerName)
    .slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">Wi-Fi</p>
          <p className="font-bold text-white">{wifi?.ssid ? String(wifi.ssid) : 'Not connected / not captured'}</p>
          {wifi?.bssid ? <p className="mt-0.5 font-mono text-[10px] text-slate-500">{String(wifi.bssid)}</p> : null}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
          <p className="text-slate-500">Nearby BLE devices</p>
          <p className="font-bold text-white">{bluetooth?.deviceCount != null ? `${bluetooth.deviceCount} detected` : 'Not captured'}</p>
        </div>
      </div>
      {devices.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {devices.map((device, index) => (
            <span key={index} className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
              {String(device.displayName || device.manufacturerName)}
            </span>
          ))}
        </div>
      )}
      {asArray(radioContext.limitations).length > 0 && (
        <p className="text-[10px] text-slate-600">{(asArray(radioContext.limitations) as string[]).join(' ')}</p>
      )}
    </div>
  );
}

function RawAnalysisPanel({ caseData }: { caseData: Case }) {
  const analysis = caseData.analysis;
  if (!analysis) return null;

  // Source/visual/venue-resolution analysis already render structured, in
  // depth, behind the Source and Venue drill-down tabs above — repeating them
  // here as JSON would just be the same evidence twice. Forensic summary is
  // plain text already. Everything else gets a real, human-readable renderer
  // — no JSON anywhere in this panel.
  const forensicSummary = typeof analysis.forensic_summary === 'string' ? analysis.forensic_summary : '';
  const applicationAssessment = asRecord(analysis.application_assessment);
  const contextReconciliation = asRecord(analysis.context_reconciliation);
  const aiReviewBrief = asRecord(analysis.ai_review_brief);
  const radioContext = asRecord(analysis.radio_context);
  const hasAnyPhase2 = Boolean(forensicSummary || applicationAssessment || contextReconciliation || aiReviewBrief);

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-fuchsia-400">Phase 2 analysis</p>
          <h3 className="mt-2 text-2xl font-black text-white">Additional evidence</h3>
          <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-400">
            Source, visual, and venue evidence are covered by the tabs above — this is everything else the pipeline produced.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
          {formatContractToken(analysis.processing_stage)}
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {!hasAnyPhase2 && (
          <p className="text-sm font-medium text-slate-500">
            No advanced analysis yet — run advanced processing to populate this (Phase 2).
          </p>
        )}

        {forensicSummary && (
          <details className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-300">Forensic summary</summary>
            <p className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-[12px] leading-6 text-slate-300">{forensicSummary}</p>
          </details>
        )}
        {applicationAssessment && (
          <details className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4" open>
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-300">Application assessment</summary>
            <div className="mt-3"><ApplicationAssessmentSection assessment={applicationAssessment} /></div>
          </details>
        )}
        {contextReconciliation && (
          <details className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-300">Declared vs. detected context</summary>
            <div className="mt-3"><ContextReconciliationSection reconciliation={contextReconciliation} /></div>
          </details>
        )}
        {aiReviewBrief && (
          <details className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
            <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-300">AI review brief</summary>
            <div className="mt-3"><AiReviewBriefSection brief={aiReviewBrief} /></div>
          </details>
        )}
        <details className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4" open={Boolean(radioContext)}>
          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-300">Radio context (Wi-Fi / Bluetooth)</summary>
          <div className="mt-3"><RadioContextSection radioContext={radioContext} /></div>
        </details>
      </div>
    </section>
  );
}

function CaseDetailView({
  caseData,
  onUpdateStage,
  addComment,
  userRole,
  clearNotification,
  onCreateVault,
  onDeleteVault,
  onRequestMoreProof,
  onBackfillAudioDeconstruction,
  onReevaluateCase,
  canBackfillAudioDeconstruction,
  isBackfillingAudioDeconstruction,
  isReevaluatingCase,
  setActiveTab,
  setListTab,
  onSelectCase,
  addToRoute,
  removeFromRoute,
  isInRoute
}: { 
  caseData: Case, 
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer', resNote?: string, resAgentName?: string, selectedVaultIds?: string[], agentActionTaken?: string) => void,
  addComment: (id: string, text: string) => void,
  userRole: UserRole,
  clearNotification: (id: string, type: 'comments' | 'major') => void,
  onCreateVault: (id: string) => void,
  onDeleteVault: (vaultId: string) => void,
  onRequestMoreProof: (vaultId: string) => void,
  onBackfillAudioDeconstruction: () => void,
  onReevaluateCase: () => void,
  canBackfillAudioDeconstruction: boolean,
  isBackfillingAudioDeconstruction: boolean,
  isReevaluatingCase: boolean,
  setActiveTab: (tab: string) => void,
  setListTab: (tab: 'upcoming' | 'active' | 'closed') => void,
  onSelectCase: (id: string) => void,
  addToRoute: (id: string) => void,
  removeFromRoute: (id: string) => void,
  isInRoute: boolean
}) {
  const [modalType, setModalType] = useState<'Agent' | 'Lawyer' | null>(null);
  const [isDoneModalOpen, setIsDoneModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [activeDetailTab, setActiveDetailTab] = useState<string>('evidence-0');
  const [activeVaultIndex, setActiveVaultIndex] = useState(0);
  const isSongAnalyticsFailed = isTrackIdentificationFailed(caseData);
  const isVisualFailure = isVisualAnalyticsFailed(caseData, activeVaultIndex);
  const isEvidenceLocked = ['Ready For Legal', 'Recovery In Progress', 'Closed'].includes(caseData.stage);
  const orderedAudioArtifacts = [...(caseData.audioDeconstruction?.artifacts || [])].sort((left, right) => (
    getStemPriority(left.stem) - getStemPriority(right.stem)
  ));

  const handleTabChange = (tab: string) => {
    setActiveDetailTab(tab);
    if (tab === 'audit') clearNotification(caseData.id, 'major');
    if (tab === 'comments') clearNotification(caseData.id, 'comments');
    if (tab.startsWith('evidence-')) {
      setActiveVaultIndex(parseInt(tab.split('-')[1]));
    }
  };

  const handleConfirm = (notes: string, selectedVaultIds?: string[]) => {
    if (modalType === 'Agent') {
      onUpdateStage(caseData.id, 'Agent Assignment', notes, 'Agent', undefined, undefined, selectedVaultIds);
    } else if (modalType === 'Lawyer') {
      onUpdateStage(caseData.id, 'Ready For Legal', notes, 'Lawyer', undefined, undefined, selectedVaultIds);
    }
    setModalType(null);
  };

  const handleDoneConfirm = (action: string, notes: string) => {
    onUpdateStage(caseData.id, caseData.stage, notes, undefined, notes, caseData.assignedTo, undefined, action); // Just add to audit trail + action
    setIsDoneModalOpen(false);
  };

  const handleAddComment = () => {
    if (!commentText.trim()) return;
    addComment(caseData.id, commentText);
    setCommentText('');
  };

  const exportPDF = () => {
    console.log("Generating Forensic Evidence PDF... (Mock Export)");
    // In a real app, this would use a library like jspdf or a server-side route
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15 },
    show: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] }
    }
  };

  return (
    <>
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="show"
        key={caseData.id}
        className="max-w-6xl mx-auto space-y-10"
      >
        {/* Latest Status Audit Insight - Minimal Version (for Agents) */}
        {userRole === 'Agent' && caseData.auditTrail.length > 0 && (
          <motion.div 
            variants={itemVariants}
            className="p-6 border border-border-standard bg-white/[0.01] rounded-[24px] relative overflow-hidden shadow-sm"
          >
            <div className="flex items-start justify-between gap-10">
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="px-2 py-0.5 bg-brand-indigo/10 border border-brand-indigo/20 rounded text-[8px] font-black text-brand-indigo uppercase tracking-widest">
                    Latest Assigned Task
                  </div>
                  <span className="text-[8px] font-black text-text-quaternary uppercase tracking-widest opacity-40 italic">
                    Referenced from log: {caseData.auditTrail[caseData.auditTrail.length - 1].action}
                  </span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed font-bold">
                  {caseData.auditTrail[caseData.auditTrail.length - 1].details}
                </p>
              </div>
              <div className="text-right flex flex-col justify-between h-full py-1">
                <div>
                   <p className="text-[8px] font-black text-text-quaternary uppercase tracking-widest opacity-40 mb-1">Last Updated</p>
                   <p className="text-[10px] text-text-secondary font-black">{format(new Date(caseData.auditTrail[caseData.auditTrail.length - 1].timestamp), 'HH:mm:ss')}</p>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5">
                   <p className="text-[8px] font-black text-text-quaternary uppercase tracking-widest opacity-40 mb-1">Authorized Actor</p>
                   <p className="text-[10px] text-brand-indigo font-black uppercase tracking-widest">{caseData.auditTrail[caseData.auditTrail.length - 1].actor}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Header Section */}
        <motion.div variants={itemVariants} className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 pb-12 border-b border-border-subtle">
          <div className="flex-1 space-y-5">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-accent-violet/10 border border-accent-violet/20 rounded-full">
                <span className="text-accent-violet text-[10px] font-black tracking-widest uppercase">{caseData.id}</span>
              </div>
              <span className="text-text-quaternary text-caption font-bold tracking-tight">{format(caseData.timestamp, 'MMMM dd, yyyy • HH:mm')}</span>
            </div>
            
            <div>
              <h1 className="text-2xl md:text-h1 text-text-primary tracking-tight mb-2 leading-tight md:leading-none" style={{ textWrap: 'balance' }}>{caseData.location.name}</h1>
              <div className="flex items-center gap-4">
                <p className="text-text-tertiary text-sm flex items-center gap-2 font-medium">
                  <MapPin className="w-4 h-4 text-text-quaternary" />
                  {caseData.location.city}, India
                </p>
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm",
                  caseData.stage === 'New' ? "bg-white/5 text-text-secondary border-border-standard" : 
                  caseData.stage === 'Under Review' ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : 
                  caseData.stage === 'Agent Assignment' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                  caseData.stage === 'Ready For Legal' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  caseData.stage === 'Recovery In Progress' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                  "bg-white/5 text-text-quaternary border-border-standard"
                )}>
                  {caseData.stage}
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0">
            <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
              <div className="bg-white/[0.02] border border-border-standard rounded-2xl px-6 py-4 min-w-[140px] shadow-sm flex flex-col justify-center">
                 <p className="text-[9px] font-black text-text-quaternary uppercase tracking-widest mb-1">Track</p>
                 <div className="text-xl font-black text-text-primary leading-tight">{trackIdentityLabel(caseData)}</div>
              </div>
              <div className="bg-white/[0.02] border border-border-standard rounded-2xl px-6 py-4 min-w-[140px] shadow-sm flex flex-col justify-center">
                 <p className="text-[9px] font-black text-text-quaternary uppercase tracking-widest mb-1">Recovery Value</p>
                 <div className="text-2xl font-black text-accent-violet leading-tight">₹{(caseData.recoverableValue / 1000).toFixed(0)}k</div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={exportPDF}
                className="bg-white/[0.02] border border-border-standard rounded-2xl px-6 py-4 flex items-center justify-center gap-3 hover:bg-white/[0.04] transition-all shadow-sm group whitespace-nowrap"
              >
                 <FileText className="w-4 h-4 text-accent-violet group-hover:scale-110 transition-transform" />
                 <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">Forensic PDF</span>
              </button>

              {userRole === 'Agent' && (
                <button 
                  onClick={() => isInRoute ? removeFromRoute(caseData.id) : addToRoute(caseData.id)}
                  className={cn(
                    "rounded-2xl px-6 py-4 flex items-center justify-center gap-3 transition-all shadow-sm group whitespace-nowrap border",
                    isInRoute 
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20" 
                      : "bg-brand-indigo text-white border-brand-indigo/50 hover:bg-brand-indigo/90 shadow-lg shadow-brand-indigo/20"
                  )}
                >
                   {isInRoute ? (
                     <CheckCircle2 className="w-4 h-4" />
                   ) : (
                     <Navigation className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                   )}
                   <span className="text-[10px] font-black uppercase tracking-widest">
                     {isInRoute ? "In Route" : "Add to Route"}
                   </span>
                </button>
              )}

              {userRole === 'Admin' && caseData.stage === 'New' && (
                <button 
                  onClick={() => {
                    onUpdateStage(caseData.id, 'Under Review', 'Case moved to active review by administrator.');
                    setListTab('active');
                    setActiveTab('cases');
                  }}
                  className="bg-brand-indigo hover:bg-brand-indigo/90 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl px-6 py-4 shadow-xl shadow-brand-indigo/20 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap"
                >
                  <ArrowRight className="w-4 h-4" />
                  Move to Active
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Agent Resolution Highlight (For Admin) */}
        {userRole === 'Admin' && caseData.agentActionTaken && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-12 p-10 bg-emerald-500/5 border-2 border-emerald-500/30 rounded-[40px] relative overflow-hidden group shadow-2xl"
          >
            <div className="absolute -top-10 -right-10 opacity-[0.03] group-hover:scale-110 transition-transform duration-700">
               <CheckCircle2 className="w-64 h-64 text-emerald-500" />
            </div>
            <div className="relative z-10">
               <div className="flex items-center gap-3 mb-8">
                 <div className="w-10 h-10 rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                 </div>
                 <div>
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] block mb-0.5">Field Verification Complete</span>
                    <h3 className="text-xl font-black text-white tracking-tight">Agent Resolution Declared</h3>
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-8 border-t border-emerald-500/10">
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <Smartphone className="w-3 h-3" /> Action Taken
                    </p>
                    <p className="text-2xl font-black text-white leading-tight">
                      {caseData.agentActionTaken.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <FileText className="w-3 h-3" /> Field Agent's Narrative
                    </p>
                    <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl">
                      <p className="text-[14px] text-slate-300 font-medium italic leading-relaxed">
                        "{caseData.agentResolutionNote || 'No specific details provided by the agent.'}"
                      </p>
                    </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}

        {/* Song Details Section */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="md:col-span-3 p-8 bg-white/[0.02] rounded-3xl border border-border-standard flex items-center gap-8">
            <div className="w-20 h-20 rounded-2xl bg-brand-indigo/10 flex items-center justify-center border border-brand-indigo/20 shrink-0">
              <Music className="w-10 h-10 text-brand-indigo" />
            </div>
            <div className="flex-1">
              <p className="text-tiny font-black text-text-quaternary uppercase tracking-widest mb-1">Identified Track</p>
              <h2 className="text-2xl font-black text-text-primary mb-1">{caseData.songAssessment.title}</h2>
              <p className="text-sm font-bold text-text-secondary">{caseData.songAssessment.artists.join(', ')} • {caseData.musicLabel}</p>
            </div>
            {isSongAnalyticsFailed && (
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={onReevaluateCase}
                  disabled={isReevaluatingCase || !canBackfillAudioDeconstruction}
                  className={cn(
                    "inline-flex items-center gap-2 px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl border transition-all",
                    !isReevaluatingCase && canBackfillAudioDeconstruction
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95"
                      : "bg-white/5 border-white/5 text-slate-500 cursor-not-allowed"
                  )}
                >
                  <RefreshCcw className={cn("w-3.5 h-3.5", isReevaluatingCase && "animate-spin")} />
                  {isReevaluatingCase ? 'Retrying' : 'Retry Analytics'}
                </button>
              </div>
            )}
            <div className="hidden lg:grid grid-cols-2 gap-x-8 gap-y-2 border-l border-border-subtle pl-8">
              <div>
                <p className="text-[9px] font-black text-text-quaternary uppercase tracking-widest">ISRC</p>
                <p className="text-[11px] font-mono font-bold text-text-primary">{caseData.songAssessment.isrc}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-text-quaternary uppercase tracking-widest">UPC</p>
                <p className="text-[11px] font-mono font-bold text-text-primary">{caseData.songAssessment.upc}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-text-quaternary uppercase tracking-widest">Rights</p>
                <p className="text-[11px] font-bold text-brand-indigo">{caseData.songAssessment.rightsAssociation}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-text-quaternary uppercase tracking-widest">Label</p>
                <p className="text-[11px] font-bold text-text-secondary">{caseData.songAssessment.labelOwner}</p>
              </div>
            </div>
          </div>
          <div className="p-8 bg-white/[0.02] rounded-3xl border border-border-standard flex flex-col justify-center">
            <p className="text-tiny font-black text-text-quaternary uppercase tracking-widest mb-3">Integrity Check</p>
            <div className="space-y-2">
              {Object.entries(caseData.trustGates).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <div className={cn("w-1.5 h-1.5 rounded-full", value ? "bg-emerald-500" : "bg-red-500")} />
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <ReviewReadinessPanel caseData={caseData} />

        <RawAnalysisPanel caseData={caseData} />

        {/* Detail Tabs */}
        <motion.div variants={itemVariants} className="flex border-b border-slate-800 gap-6 items-center overflow-x-auto">
          {caseData.evidenceVaults.map((vault, idx) => (
            <div key={vault.id} className="relative flex items-center group shrink-0">
              <button
                onClick={() => handleTabChange(`evidence-${idx}`)}
                className={cn(
                  "pb-4 text-[11px] font-black uppercase tracking-widest transition-all relative px-1 flex items-center gap-2",
                  activeDetailTab === `evidence-${idx}` ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {vault.videoUrl ? <Video className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                {vault.name}
                {activeDetailTab === `evidence-${idx}` && <motion.div layoutId="detailTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-t" />}
              </button>
              {userRole === 'Admin' && !isEvidenceLocked && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteVault(vault.id);
                  }}
                  className="absolute right-0 top-0 p-1 text-slate-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete vault"
                >
                  <Plus className="w-3 h-3 rotate-45" />
                </button>
              )}
            </div>
          ))}
          
          {userRole === 'Agent' && (
            <button 
              onClick={() => onCreateVault(caseData.id)}
              className="pb-4 text-slate-500 hover:text-blue-400 transition-all flex items-center justify-center"
              title="Add Evidence Vault"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          <div className="flex-1" />

          <button 
            onClick={() => handleTabChange('audit')}
            className={cn(
              "pb-4 text-[11px] font-black uppercase tracking-widest transition-all relative flex items-center gap-2",
              activeDetailTab === 'audit' ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
            )}
          >
            Status Audit Trail
            {caseData.unreadMajorChanges && (
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-sm shadow-red-500/50" />
            )}
            {activeDetailTab === 'audit' && <motion.div layoutId="detailTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
          </button>

          <button 
            onClick={() => handleTabChange('custody')}
            className={cn(
              "pb-4 text-[11px] font-black uppercase tracking-widest transition-all relative flex items-center gap-2",
              activeDetailTab === 'custody' ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
            )}
          >
            Chain of Custody
            {activeDetailTab === 'custody' && <motion.div layoutId="detailTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
          </button>
          
          {userRole !== 'Agent' && (
            <button 
              onClick={() => handleTabChange('comments')}
              className={cn(
                "pb-4 text-[11px] font-black uppercase tracking-widest transition-all relative flex items-center gap-2",
                activeDetailTab === 'comments' ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Internal Threads
              {caseData.unreadComments && (
                <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50" />
              )}
              {activeDetailTab === 'comments' && <motion.div layoutId="detailTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
            </button>
          )}
        </motion.div>

        <motion.div 
          variants={itemVariants}
          className={cn(
            "grid gap-10",
            userRole === 'Agent' ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
          )}
        >
          <div className="space-y-10">
            {activeDetailTab.startsWith('evidence-') ? (
              <>
                {/* Vault Content */}
                <section className="space-y-8 rounded-2xl border border-border-subtle bg-white/[0.01] p-8">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">
                      {caseData.evidenceVaults[activeVaultIndex]?.name} Assets
                    </h3>
                    <span className="text-[10px] text-slate-500 font-bold">
                      Captured {format(caseData.evidenceVaults[activeVaultIndex]?.timestamp || new Date(), 'MMM dd, HH:mm')}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-10">
                    <div className="bg-black rounded-3xl overflow-hidden border border-slate-800 shadow-2xl relative group aspect-video">
                      <div className="absolute top-6 left-6 z-10 flex items-center gap-2 bg-slate-900/95 backdrop-blur-xl px-4 py-2 rounded-xl border border-slate-800 shadow-xl">
                        <Video className="w-4 h-4 text-blue-400" />
                        <span className="text-[11px] font-black text-white uppercase tracking-widest">Master Forensic Stream</span>
                      </div>
                      <video 
                        src={caseData.evidenceVaults[activeVaultIndex]?.videoUrl || caseData.videoProofUrl} 
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        autoPlay 
                        muted 
                        loop 
                      />
                    </div>
                    
                    <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-sm flex flex-col justify-between h-full">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between mb-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-900/20 flex items-center justify-center border border-blue-900/30">
                              <FileText className="w-4 h-4 text-blue-400" />
                            </div>
                            <h3 className="font-black text-white uppercase tracking-widest text-[11px]">Vault Notes</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            {isVisualFailure && (
                              <button
                                type="button"
                                onClick={onReevaluateCase}
                                disabled={isReevaluatingCase || !canBackfillAudioDeconstruction}
                                className={cn(
                                  "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all inline-flex items-center gap-2 border",
                                  !isReevaluatingCase && canBackfillAudioDeconstruction
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95"
                                    : "bg-white/5 border-white/5 text-slate-500 cursor-not-allowed"
                                )}
                              >
                                <RefreshCcw className={cn("w-3.5 h-3.5", isReevaluatingCase && "animate-spin")} />
                                {isReevaluatingCase ? 'Retrying' : 'Retry Analytics'}
                              </button>
                            )}
                            {userRole === 'Admin' && (
                              <button
                                disabled={caseData.evidenceVaults[activeVaultIndex]?.moreProofRequested || !!caseData.evidenceVaults.find((v, idx) => {
                                  return idx < activeVaultIndex && !v.moreProofRequested;
                                })}
                                onClick={() => onRequestMoreProof(caseData.evidenceVaults[activeVaultIndex].id)}
                                className={cn(
                                  "px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all",
                                  caseData.evidenceVaults[activeVaultIndex]?.moreProofRequested 
                                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" 
                                    : "bg-white/5 border border-border-standard text-text-tertiary hover:text-blue-400 hover:border-blue-500/30 active:scale-95"
                                )}
                              >
                                {caseData.evidenceVaults[activeVaultIndex]?.moreProofRequested ? "Proof Requested" : "Request More Proof"}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-slate-300 text-sm leading-relaxed font-medium italic">
                          "{caseData.evidenceVaults[activeVaultIndex]?.notes || "No additional notes provided for this vault."}"
                        </p>
                      </div>
                      {caseData.evidenceVaults[activeVaultIndex]?.moreProofRequested && (
                        <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-3">
                           <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                           <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Pending Agent Re-Verification</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <section className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-900/20 flex items-center justify-center border border-blue-900/30">
                          <Music className="w-4 h-4 text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-black text-white uppercase tracking-widest text-[11px]">Audio Deconstruction</h3>
                          <p className="mt-1 text-[11px] text-slate-400 font-medium">
                            Demucs stem isolation for music-first review inside the forensic stream.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={onReevaluateCase}
                          disabled={!canBackfillAudioDeconstruction || isReevaluatingCase}
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl border transition-all",
                            canBackfillAudioDeconstruction && !isReevaluatingCase
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 hover:border-emerald-500/40 active:scale-95"
                              : "bg-white/5 border-white/5 text-slate-500 cursor-not-allowed"
                          )}
                        >
                          <RefreshCcw className={cn("w-3.5 h-3.5", isReevaluatingCase && "animate-spin")} />
                          {isReevaluatingCase ? 'Re-evaluating' : (canBackfillAudioDeconstruction ? 'Re-evaluate Package' : 'Backend Required')}
                        </button>
                        <button
                          type="button"
                          onClick={onBackfillAudioDeconstruction}
                          disabled={!canBackfillAudioDeconstruction || isBackfillingAudioDeconstruction}
                          className={cn(
                            "inline-flex items-center gap-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl border transition-all",
                            canBackfillAudioDeconstruction && !isBackfillingAudioDeconstruction
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/15 hover:border-blue-500/40 active:scale-95"
                              : "bg-white/5 border-white/5 text-slate-500 cursor-not-allowed"
                          )}
                        >
                          <RefreshCcw className={cn("w-3.5 h-3.5", isBackfillingAudioDeconstruction && "animate-spin")} />
                          {isBackfillingAudioDeconstruction
                            ? 'Running Demucs'
                            : canBackfillAudioDeconstruction
                              ? (caseData.audioDeconstruction?.status === 'completed' ? 'Rerun Demucs' : 'Run Demucs')
                              : 'Backend Required'}
                        </button>
                        <span className={cn(
                          "w-fit px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl",
                          getDeconstructionStatusTone(caseData.audioDeconstruction?.status || 'unknown')
                        )}>
                          {caseData.audioDeconstruction ? caseData.audioDeconstruction.status : 'Not Available'}
                        </span>
                      </div>
                    </div>

                    {caseData.audioDeconstruction ? (
                      <div className="mt-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Processing Method</p>
                            <div className="flex flex-wrap gap-2">
                              <span className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl bg-white/5 border border-white/5 text-slate-300">
                                {caseData.audioDeconstruction.provider || 'Demucs'}
                              </span>
                              {caseData.audioDeconstruction.model && (
                                <span className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl bg-white/5 border border-white/5 text-slate-300">
                                  {caseData.audioDeconstruction.model}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Selected Stems</p>
                            <div className="flex flex-wrap gap-2">
                              {caseData.audioDeconstruction.preferredStem && (
                                <span className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                  Primary: {formatStemLabel(caseData.audioDeconstruction.preferredStem)}
                                </span>
                              )}
                              {caseData.audioDeconstruction.fingerprintStem && (
                                <span className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                  Match: {formatStemLabel(caseData.audioDeconstruction.fingerprintStem)}
                                </span>
                              )}
                              {caseData.audioDeconstruction.peakSelectionStem && (
                                <span className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                  Peak: {formatStemLabel(caseData.audioDeconstruction.peakSelectionStem)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-white/5 bg-slate-950/60 p-5">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Process Notes</p>
                          <p className="text-sm text-slate-300 leading-relaxed">
                            {caseData.audioDeconstruction.summary || 'Audio deconstruction completed without a stored narrative summary.'}
                          </p>
                          {caseData.audioDeconstruction.error && (
                            <p className="mt-3 text-[12px] text-red-400 font-medium">
                              {caseData.audioDeconstruction.error}
                            </p>
                          )}
                        </div>

                        {orderedAudioArtifacts.length > 0 ? (
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {orderedAudioArtifacts.map((artifact) => {
                              const isPreferred = artifact.stem === caseData.audioDeconstruction?.preferredStem;
                              const isFingerprintStem = artifact.stem === caseData.audioDeconstruction?.fingerprintStem;
                              const isPeakStem = artifact.stem === caseData.audioDeconstruction?.peakSelectionStem;

                              return (
                                <div key={artifact.assetId} className="rounded-2xl border border-white/5 bg-slate-950/60 p-5">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Separated Stem</p>
                                      <p className="mt-2 text-lg font-black text-white">{formatStemLabel(artifact.stem)}</p>
                                    </div>
                                    <a
                                      href={artifact.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="w-10 h-10 rounded-xl bg-white/[0.03] flex items-center justify-center border border-white/5 text-slate-400 hover:text-blue-400 hover:border-blue-500/30 transition-colors"
                                      title={`Open ${formatStemLabel(artifact.stem)}`}
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                    </a>
                                  </div>

                                  <div className="mt-4 flex flex-wrap gap-2">
                                    {isPreferred && (
                                      <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                        Master Review
                                      </span>
                                    )}
                                    {isFingerprintStem && (
                                      <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                        Song Match
                                      </span>
                                    )}
                                    {isPeakStem && (
                                      <span className="px-2.5 py-1 text-[9px] font-black uppercase tracking-widest rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                                        Peak Select
                                      </span>
                                    )}
                                  </div>

                                  <audio controls preload="none" className="mt-4 w-full">
                                    <source src={artifact.url} type={artifact.mimeType || 'audio/wav'} />
                                  </audio>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                            No separated stem artifacts were attached to this evidence package.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-5 text-sm text-slate-400">
                        No audio deconstruction is attached to this evidence package yet. Once the Demucs-backed forensic pass runs for the submission, the music stem and related artifacts will appear here.
                      </div>
                    )}
                  </section>

                  {/* Vault Images */}
                  {caseData.evidenceVaults[activeVaultIndex]?.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {caseData.evidenceVaults[activeVaultIndex].images.map((img, i) => (
                        <div key={i} className="aspect-square rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden group">
                          <img src={img} className="w-full h-full object-cover group-hover:scale-110 transition-transform" referrerPolicy="no-referrer" />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : activeDetailTab === 'custody' ? (
              <section className="bg-slate-900 rounded-[40px] p-10 border border-slate-800 shadow-sm">
                <div className="mb-8">
                  <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Forensic Chain of Custody</h3>
                  <p className="text-[9px] text-slate-600">Complete audit trail of evidence handling and verification</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900/80 border-b border-slate-800">
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Timestamp</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Event</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Actor</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Device</th>
                        <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {caseData.chainOfCustody.map((entry, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-6 py-4 text-[10px] font-mono text-slate-400">{format(new Date(entry.timestamp), 'MM-dd HH:mm:ss')}</td>
                          <td className="px-6 py-4 text-[11px] font-bold text-slate-100">{entry.event}</td>
                          <td className="px-6 py-4 text-[10px] font-black text-blue-300 uppercase tracking-widest">{entry.actor}</td>
                          <td className="px-6 py-4 text-[9px] font-mono text-slate-500">{entry.deviceId}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                              entry.status === 'Verified' ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-red-500/10 text-red-300 border-red-500/30"
                            )}>
                              {entry.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : activeDetailTab === 'audit' ? (
              <section className="bg-slate-900 rounded-[40px] p-10 border border-slate-800 shadow-sm">
                <div className="mb-8">
                  <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-2">Status Audit Trail</h3>
                  <p className="text-[9px] text-slate-600">Complete history of case status changes and decisions</p>
                </div>
                <div className="space-y-8">
                  {[...caseData.auditTrail].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime()).map((entry) => (
                    <div key={entry.id} className="flex gap-6">
                      <div className="flex flex-col items-center gap-2 pt-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <div className="w-0.5 flex-1 bg-slate-800" />
                      </div>
                      <div className="flex-1 pb-8 border-b border-slate-800 last:border-0">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-black text-white uppercase tracking-widest">{entry.action}</h4>
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold">{format(entry.timestamp, 'MMM dd, yyyy HH:mm:ss')}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Actor: {entry.actor}</span>
                          {entry.previousStage && (
                            <>
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{entry.previousStage}</span>
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{entry.newStage}</span>
                            </>
                          )}
                        </div>
                        {(entry.summary || entry.previousValue || entry.newValue) && (
                          <div className="mb-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                            {entry.eventType && <p className="mb-2 font-mono text-[9px] font-black uppercase tracking-widest text-blue-300">{entry.eventType}</p>}
                            {entry.summary && <p className="text-sm font-bold text-slate-300">{entry.summary}</p>}
                            {(entry.previousValue || entry.newValue) && (
                              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                {entry.previousValue || 'empty'} → <span className="text-emerald-300">{entry.newValue || 'empty'}</span>
                              </p>
                            )}
                          </div>
                        )}
                        {entry.action === "Case Created" ? (
                          <div className="flex items-center gap-2 py-2">
                             <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">System Initialization</span>
                             <div className="h-px flex-1 bg-slate-800/50" />
                             <span className="text-[9px] text-slate-500 font-bold">{format(entry.timestamp, 'MMM dd, HH:mm')}</span>
                          </div>
                        ) : entry.details && entry.details !== "No additional notes provided" ? (
                          <p className="text-sm text-slate-400 leading-relaxed italic">"{entry.details}"</p>
                        ) : (
                          <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold">System Log: Standard Entry</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <section className="flex flex-col h-[600px]">
                <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-4">
                  {caseData.comments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-600">
                      <Inbox className="w-12 h-12 mb-4 opacity-20" />
                      <p className="text-sm font-bold uppercase tracking-widest">No internal comments yet</p>
                    </div>
                  ) : (
                    caseData.comments.map((comment) => (
                      <div key={comment.id} className={cn(
                        "flex flex-col gap-2",
                        comment.role === userRole ? "items-end" : "items-start"
                      )}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{comment.author}</span>
                          <span className="text-[8px] text-slate-600 font-bold">{format(comment.timestamp, 'HH:mm')}</span>
                        </div>
                        <div className={cn(
                          "max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed",
                          comment.role === userRole 
                            ? "bg-brand-indigo text-white rounded-tr-none shadow-lg shadow-brand-indigo/20" 
                            : "bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none"
                        )}>
                          {comment.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-6 bg-slate-900 rounded-3xl border border-slate-800 flex gap-4">
                  <input 
                    type="text" 
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Type your internal message..."
                    className="flex-1 bg-transparent text-sm text-white outline-none"
                  />
                  <button 
                    onClick={handleAddComment}
                    className="px-6 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                  >
                    Send
                  </button>
                </div>
              </section>
            )}
          </div>

          {userRole === 'Agent' && (
            <div className="space-y-10">
              <section className="flex flex-col h-[600px] bg-slate-900/50 rounded-[40px] p-10 border border-slate-800 shadow-inner">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em]">Internal Threads</h3>
                  {caseData.unreadComments && (
                    <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest">New Activity</span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-4 custom-scrollbar">
                  {caseData.comments.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700">
                      <MessageSquare className="w-12 h-12 mb-4 opacity-10" />
                      <p className="text-xs font-black uppercase tracking-widest opacity-20">No internal discussion</p>
                    </div>
                  ) : (
                    caseData.comments.map((comment) => (
                      <div key={comment.id} className={cn(
                        "flex flex-col gap-2",
                        comment.role === userRole ? "items-end" : "items-start"
                      )}>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{comment.author}</span>
                          <span className="text-[8px] text-slate-600 font-bold">{format(comment.timestamp, 'HH:mm')}</span>
                        </div>
                        <div className={cn(
                          "max-w-[90%] p-4 rounded-2xl text-sm leading-relaxed",
                          comment.role === userRole 
                            ? "bg-brand-indigo text-white rounded-tr-none shadow-lg shadow-brand-indigo/20" 
                            : "bg-slate-950 text-slate-300 border border-slate-800 rounded-tl-none"
                        )}>
                          {comment.text}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 flex gap-3">
                  <input 
                    type="text" 
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                    placeholder="Reply to thread..."
                    className="flex-1 bg-transparent text-xs text-white outline-none"
                  />
                  <button 
                    onClick={handleAddComment}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </section>
            </div>
          )}
        </motion.div>

        {/* Actions Section */}
        <motion.section 
          variants={itemVariants}
          className="flex flex-col md:flex-row items-center justify-between gap-8 pt-10 border-t border-border-subtle"
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-3 h-3 rounded-full shadow-sm",
              caseData.stage === 'New' ? "bg-blue-600" : 
              caseData.stage === 'Under Review' ? "bg-amber-600" :
              caseData.stage === 'Agent Assignment' ? "bg-cyan-600" :
              caseData.stage === 'Ready For Legal' ? "bg-emerald-600" :
              caseData.stage === 'Recovery In Progress' ? "bg-purple-600" : "bg-slate-600"
            )} />
            <p className="text-sm font-black text-white uppercase tracking-[0.2em]">
              Case Status: {caseData.stage}
            </p>
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            {userRole === 'Agent' && !isEvidenceLocked && (
              <>
                <button 
                  onClick={() => onCreateVault(caseData.id)}
                  className="flex-1 md:flex-none px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-slate-700 shadow-sm active:scale-95 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add New Evidence Vault
                </button>
                <button 
                  onClick={() => setIsDoneModalOpen(true)}
                  className="flex-1 md:flex-none px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-xl shadow-emerald-600/20 transition-all transform hover:-translate-y-0.5 active:scale-95"
                >
                  Done
                </button>
              </>
            )}
            {userRole === 'Agent' && isEvidenceLocked && (
               <div className="flex items-center gap-2 px-4 py-2 border border-border-standard bg-white/5 rounded-lg opacity-60">
                 <ShieldCheck className="w-4 h-4 text-emerald-500" />
                 <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest">Case Forensically Locked</span>
               </div>
            )}
            {userRole === 'Admin' && caseData.stage === 'New' && (
              <div />
            )}
            {userRole === 'Admin' && caseData.stage !== 'New' && !isEvidenceLocked && (
              <button 
                onClick={() => setModalType('Agent')}
                className="flex-1 md:flex-none px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-border-standard shadow-sm hover:shadow-md active:scale-95"
              >
                {caseData.hasBeenSentToAgent ? "Send Back to Agent" : "Request More Proof"}
              </button>
            )}
            {userRole !== 'Agent' && (
              <button 
                onClick={() => setModalType('Lawyer')}
                disabled={['New', 'Ready For Legal', 'Recovery In Progress', 'Closed'].includes(caseData.stage)}
                className={cn(
                  "flex-1 md:flex-none px-8 py-4 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-xl transition-all transform active:scale-95",
                  ['New', 'Ready For Legal', 'Recovery In Progress', 'Closed'].includes(caseData.stage)
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700 shadow-none"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/20 hover:-translate-y-0.5"
                )}
              >
                {['Ready For Legal', 'Recovery In Progress', 'Closed'].includes(caseData.stage) 
                  ? "Sent to Litigation" 
                  : caseData.stage === 'New' 
                    ? "Activate Case to Recover" 
                    : "Initiate Recovery"}
              </button>
            )}
          </div>
        </motion.section>
      </motion.div>

      <AnimatePresence>
        {modalType && (
          <VerificationModal 
            isOpen={!!modalType} 
            onClose={() => setModalType(null)} 
            onConfirm={handleConfirm} 
            caseData={caseData} 
            type={modalType} 
          />
        )}
        {isDoneModalOpen && (
          <DoneModal 
            isOpen={isDoneModalOpen}
            onClose={() => setIsDoneModalOpen(false)}
            onConfirm={handleDoneConfirm}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function DoneModal({ 
  isOpen, 
  onClose, 
  onConfirm 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (action: string, notes: string) => void 
}) {
  const [notes, setNotes] = useState('');
  const [action, setAction] = useState('none');

  if (!isOpen) return null;

  const actionOptions = [
    { value: 'none', label: 'None' },
    { value: 'venue_visited_no_action', label: 'Venue visited, no action' },
    { value: 'venue_visited_vault_added', label: 'Venue visited, evidence vault added' },
    { value: 'venue_not_visited_issue', label: 'Venue not visited, issue encountered' },
    { value: 'venue_not_visited_no_issue', label: 'Venue not visited, no issue' },
  ];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-slate-800">
          <h3 className="text-xl font-black text-white tracking-tight">Agent Field Report</h3>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Finalize your site visit findings</p>
        </div>
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Action Taken</label>
            <select 
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
            >
              {actionOptions.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Further Details</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe your findings or issues encountered..."
              className="w-full h-32 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
            />
          </div>
        </div>
        <div className="p-8 bg-slate-950/50 border-t border-slate-800 flex gap-4">
          <button onClick={onClose} className="flex-1 py-4 bg-slate-900 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl">Cancel</button>
          <button 
            onClick={() => { onConfirm(action, notes); setNotes(''); setAction('none'); }}
            className="flex-1 py-4 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-600/20"
          >
            Mark as Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function VerificationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  caseData, 
  type 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (notes: string, selectedVaultIds?: string[]) => void, 
  caseData: Case, 
  type: 'Agent' | 'Lawyer' 
}) {
  const [notes, setNotes] = useState('');
  const [selectedVaults, setSelectedVaults] = useState<string[]>(caseData.evidenceVaults.map(v => v.id));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              type === 'Agent' ? "bg-cyan-900/20 text-cyan-400" : "bg-emerald-900/20 text-emerald-400"
            )}>
              {type === 'Agent' ? <Smartphone className="w-5 h-5" /> : <Gavel className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">
                {type === 'Agent' ? 'Request Additional Proof' : 'Initiate Legal Recovery'}
              </h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Case Verification Summary</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">
            <Inbox className="w-5 h-5 rotate-45" />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SummaryItem
              label="Trust Verification"
              value={`${getTrustPassCount(caseData)}/5 Gates Verified`}
              icon={<ShieldCheck className="w-4 h-4 text-emerald-400" />}
            />
            <SummaryItem
              label="Chain of Custody"
              value={`${caseData.chainOfCustody.length} Immutable Logs`}
              icon={<Shield className="w-4 h-4 text-blue-400" />}
            />
            <SummaryItem
              label="Forensic Assessment"
              value={trackIdentityLabel(caseData)}
              icon={<Fingerprint className="w-4 h-4 text-purple-400" />}
            />
            <SummaryItem 
              label="Physical Context" 
              value={caseData.absoluteProof.performanceContext.split(',')[0]} 
              icon={<Video className="w-4 h-4 text-amber-400" />} 
            />
          </div>

          {type === 'Lawyer' && (
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Evidence Vaults to Include</label>
              <div className="grid grid-cols-1 gap-3">
                {caseData.evidenceVaults.map(vault => (
                  <button
                    key={vault.id}
                    onClick={() => {
                      setSelectedVaults(prev => 
                        prev.includes(vault.id) 
                          ? prev.filter(id => id !== vault.id)
                          : [...prev, vault.id]
                      );
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all text-left",
                      selectedVaults.includes(vault.id)
                        ? "bg-emerald-600/10 border-emerald-500/50"
                        : "bg-slate-950 border-slate-800 opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-md flex items-center justify-center border transition-all",
                        selectedVaults.includes(vault.id) ? "bg-emerald-600 border-emerald-600" : "border-slate-700"
                      )}>
                        {selectedVaults.includes(vault.id) && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{vault.name}</p>
                        <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">{vault.images.length} Images • {format(vault.timestamp, 'MMM d, HH:mm')}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assignment Notes</label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={type === 'Agent' ? "Specify what exactly is missing in the proof..." : "Add legal instructions for the litigation team..."}
              className="w-full h-32 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none"
            />
          </div>
        </div>

        <div className="p-8 bg-slate-950/50 border-t border-slate-800 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-black uppercase tracking-widest rounded-2xl transition-all border border-slate-800"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(notes, type === 'Lawyer' ? selectedVaults : undefined)}
            disabled={type === 'Lawyer' && selectedVaults.length === 0}
            className={cn(
              "flex-1 py-4 text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
              type === 'Agent' ? "bg-cyan-600 hover:bg-cyan-700 shadow-cyan-600/20" : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
            )}
          >
            {type === 'Agent' ? 'Assign to Agent' : 'Send to Litigation'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function MapBoundsUpdater({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [100, 100], animate: true });
    }
  }, [points, map]);
  return null;
}

function MapStatsOverlay({ cases }: { cases: Case[] }) {
  const cityStats = useMemo(() => {
    const stats: Record<string, { count: number, revenue: number }> = {};
    cases.forEach(c => {
      if (!stats[c.location.city]) stats[c.location.city] = { count: 0, revenue: 0 };
      stats[c.location.city].count++;
      stats[c.location.city].revenue += c.recoverableValue;
    });
    return Object.entries(stats)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 4);
  }, [cases]);

  const stageStats = useMemo(() => {
    const stats: Record<string, number> = {};
    cases.forEach(c => {
      stats[c.stage] = (stats[c.stage] || 0) + 1;
    });
    return stats;
  }, [cases]);

  return (
    <div className="absolute bottom-10 right-10 z-[1000] w-72 space-y-4">
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl"
      >
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Regional Insights</h4>
        <div className="space-y-4">
          {cityStats.map(([city, data]) => (
            <div key={city} className="space-y-1.5">
              <div className="flex justify-between items-end">
                <span className="text-xs font-black text-white">{city}</span>
                <span className="text-[10px] font-bold text-slate-400">₹{(data.revenue/1000).toFixed(0)}k</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full" 
                  style={{ width: `${(data.count / cases.length) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-6 shadow-2xl"
      >
        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Operational Pulse</h4>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(stageStats).slice(0, 4).map(([stage, count]) => (
            <div key={stage} className="p-2.5 bg-slate-950 border border-white/5 rounded-xl">
               <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest truncate">{stage}</p>
               <p className="text-base font-black text-white">{count}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function SummaryItem({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) {
  return (
    <div className="p-4 bg-slate-950/30 rounded-2xl border border-slate-800/30 flex items-center gap-4">
      <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</p>
        <p className="text-xs font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function KanbanBoard({ cases, onSelectCase, onDragEnd, invalidMoveId }: { cases: Case[], onSelectCase: (id: string) => void, onDragEnd: (event: DragEndEvent) => void, invalidMoveId: string | null }) {
  const columns: CaseStage[] = ['New', 'Monitor / Enrich', 'Bad Case', 'Under Review', 'Agent Assignment', 'Ready For Legal', 'Recovery In Progress', 'Closed'];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    setOverId(event.over?.id as string || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setOverId(null);
    onDragEnd(event);
  };

  const activeCase = cases.find(c => c.id === activeId);
  
  const isInvalidHover = useMemo(() => {
    if (!activeCase || !overId) return false;
    
    const stages: CaseStage[] = ['New', 'Monitor / Enrich', 'Bad Case', 'Under Review', 'Agent Assignment', 'Ready For Legal', 'Recovery In Progress', 'Closed'];
    let targetStage: CaseStage | null = null;
    
    if (stages.includes(overId as CaseStage)) {
      targetStage = overId as CaseStage;
    } else {
      const overCase = cases.find(c => c.id === overId);
      if (overCase) targetStage = overCase.stage;
    }
    
    if (!targetStage) return false;
    
    const currentIdx = stages.indexOf(activeCase.stage);
    const targetIdx = stages.indexOf(targetStage);
    
    return targetStage === 'New' || targetIdx > currentIdx;
  }, [activeCase, overId, cases]);

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 overflow-x-auto bg-slate-950 p-8">
        <div className="flex gap-6 h-full min-w-max">
          {columns.map(column => (
            <KanbanColumn 
              key={column} 
              id={column} 
              title={column} 
              cases={cases.filter(c => c.stage === column)} 
              onSelectCase={onSelectCase}
              invalidMoveId={invalidMoveId}
            />
          ))}
        </div>
      </div>
      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.5',
            },
          },
        }),
      }}>
        {activeId && activeCase ? (
          <div className={cn(
            "w-80 opacity-80 rotate-3 pointer-events-none transition-all duration-200 relative",
            isInvalidHover ? "scale-90 grayscale" : ""
          )}>
            {isInvalidHover && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-red-500/20 rounded-xl border-2 border-red-500/50 backdrop-blur-[2px]">
                <AlertCircle className="w-12 h-12 text-red-500 mb-2 drop-shadow-lg" />
                <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-slate-950/80 px-2 py-1 rounded">Restricted Move</span>
              </div>
            )}
            <KanbanCard caseData={activeCase} onSelectCase={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface KanbanColumnProps {
  id: string;
  title: string;
  cases: Case[];
  onSelectCase: (id: string) => void;
  key?: string;
}

function KanbanColumn({ id, title, cases, onSelectCase, invalidMoveId }: KanbanColumnProps & { invalidMoveId: string | null }) {
  const { setNodeRef } = useSortable({
    id: id,
    data: {
      type: 'Column',
    },
  });

  return (
    <div ref={setNodeRef} className="w-80 flex flex-col bg-slate-900/30 rounded-2xl border border-slate-800/50">
      <div className="p-5 border-b border-slate-800/50 flex items-center justify-between">
        <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</h3>
        <span className="bg-slate-800 text-slate-400 text-[10px] font-black px-2 py-0.5 rounded-full">
          {cases.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <SortableContext items={cases.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cases.map(c => (
            <KanbanCard key={c.id} caseData={c} onSelectCase={onSelectCase} isInvalid={invalidMoveId === c.id} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

interface KanbanCardProps {
  caseData: Case;
  onSelectCase: (id: string) => void;
  key?: string;
  isInvalid?: boolean;
}

function KanbanCard({ caseData, onSelectCase, isInvalid }: KanbanCardProps) {
  const getStageAction = (stage: CaseStage) => {
    switch (stage) {
      case 'New':
        return { 
          displayStage: 'New Case', 
          role: 'Admin', 
          action: 'Verify Proof',
          color: 'text-blue-400',
          bgColor: 'bg-blue-400/10'
        };
      case 'Monitor / Enrich':
        return {
          displayStage: 'Monitor',
          role: 'Admin',
          action: 'Enrich Audio',
          color: 'text-purple-400',
          bgColor: 'bg-purple-400/10'
        };
      case 'Bad Case':
        return {
          displayStage: 'Bad Case',
          role: 'System',
          action: 'Extract Signals',
          color: 'text-red-400',
          bgColor: 'bg-red-400/10'
        };
      case 'Under Review':
        return { 
          displayStage: 'In Review', 
          role: 'Admin', 
          action: 'Assign Agent',
          color: 'text-amber-400',
          bgColor: 'bg-amber-400/10'
        };
      case 'Agent Assignment':
        return { 
          displayStage: 'In Field', 
          role: 'Agent', 
          action: 'Collect Evidence',
          color: 'text-cyan-400',
          bgColor: 'bg-cyan-400/10'
        };
      case 'Ready For Legal':
        return { 
          displayStage: 'Legal Ready', 
          role: 'Lawyer', 
          action: 'Check File',
          color: 'text-emerald-400',
          bgColor: 'bg-emerald-400/10'
        };
      case 'Recovery In Progress':
        return { 
          displayStage: 'In Legal', 
          role: 'Lawyer', 
          action: 'Final Settlement',
          color: 'text-purple-400',
          bgColor: 'bg-purple-400/10'
        };
      case 'Closed':
        return { 
          displayStage: 'Closed', 
          role: 'System', 
          action: 'Archive File',
          color: 'text-slate-400',
          bgColor: 'bg-slate-400/10'
        };
      default:
        return { displayStage: stage, role: 'Unknown', action: 'Pending', color: 'text-slate-500', bgColor: 'bg-slate-500/10' };
    }
  };

  const actionInfo = getStageAction(caseData.stage);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: caseData.id,
    data: {
      type: 'Case',
      case: caseData
    }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      {...attributes}
      {...listeners}
      animate={isInvalid ? { 
        x: [-8, 8, -8, 8, 0],
        borderColor: ['#1e293b', '#ef4444', '#ef4444', '#ef4444', '#1e293b']
      } : {}}
      transition={{ 
        layout: { type: 'spring', bounce: 0, duration: 0.3 },
        default: { duration: 0.25, ease: [0.23, 1, 0.32, 1] }
      }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onSelectCase(caseData.id)}
      className={cn(
        "w-full text-left bg-slate-900 border p-5 rounded-xl shadow-sm transition-all group cursor-grab active:cursor-grabbing",
        isInvalid ? "border-red-500/50 shadow-lg shadow-red-500/10" : "border-slate-800 hover:border-blue-500/50"
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <span className="text-[9px] font-black text-slate-500 group-hover:text-blue-400 transition-colors uppercase tracking-widest">{caseData.id}</span>
        <div className={cn("px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest", actionInfo.bgColor, actionInfo.color)}>
          {actionInfo.displayStage}
        </div>
      </div>
      <h4 className="text-sm font-black text-white mb-2 tracking-tight line-clamp-1">{caseData.location.name}</h4>
      
      {caseData.agentActionTaken && (
        <div className="mb-3 flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg self-start">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
          <span className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Marked as Done</span>
        </div>
      )}

      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold mb-4">
        <MapPin className="w-3 h-3" />
        {caseData.location.city}
      </div>

      <div className="mb-4 p-3 bg-white/[0.02] rounded-lg border border-white/5">
        <p className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mb-1">Pending Action</p>
        <div className="flex items-center gap-2">
           <div className="w-5 h-5 rounded bg-slate-800 flex items-center justify-center text-[8px] font-black text-slate-400">
             {actionInfo.role[0]}
           </div>
           <p className="text-[10px] font-bold text-slate-300 leading-tight">
             <span className="text-blue-400 font-black">{actionInfo.role}:</span> {actionInfo.action}
           </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-800/50">
        <div className="flex items-center gap-1 text-white font-black text-[11px]">
          <IndianRupee className="w-3 h-3 text-slate-500" />
          {caseData.expectedFine.toLocaleString()}
        </div>
        <div className="text-[10px] font-black text-blue-400">{trackIdentityLabel(caseData)}</div>
      </div>
    </motion.div>
  );
}

function MapAutoBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, points]);
  return null;
}

function AgentDashboard({ 
  cases, 
  onSelectCase, 
  onUpdateStage, 
  setActiveTab, 
  addComment, 
  onCreateVault, 
  routeCaseIds, 
  setRouteCaseIds,
  removeFromRoute
}: { 
  cases: Case[], 
  onSelectCase: (id: string) => void, 
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer', resNote?: string, resAgentName?: string, selectedVaultIds?: string[], agentActionTaken?: string) => void, 
  setActiveTab: (tab: string) => void, 
  addComment: (id: string, text: string) => void, 
  onCreateVault: (id: string) => void,
  routeCaseIds: string[],
  setRouteCaseIds: (ids: string[]) => void,
  removeFromRoute: (id: string) => void
}) {
  const [resolvingCase, setResolvingCase] = useState<Case | null>(null);
  const [selectedAgentCaseId, setSelectedAgentCaseId] = useState<string | null>(cases.length > 0 ? cases[0].id : null);
  const [showPath, setShowPath] = useState(false);

  // MISSION CONTROL SORTING: Latest first
  const sortedCases = useMemo(() => {
    return [...cases].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [cases]);

  const latestCase = sortedCases[0];
  const remainingCases = sortedCases.slice(1);

  const selectedCase = cases.find(c => c.id === selectedAgentCaseId) || cases[0];
  const routeCases = cases.filter(c => routeCaseIds.includes(c.id));

  useEffect(() => {
    if (cases.length > 0 && !selectedAgentCaseId) {
      setSelectedAgentCaseId(cases[0].id);
    }
  }, [cases, selectedAgentCaseId]);

  if (cases.length === 0) {
    return (
      <div className="h-full flex flex-col bg-bg-panel overflow-y-auto">
        <div className="p-10 border-b border-border-subtle bg-white/[0.01]">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-h2 text-text-primary tracking-tight uppercase">Case Tracker</h2>
            <div className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full">
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <span className="text-[11px] font-black text-cyan-400 uppercase tracking-widest">Case Tracker</span>
            </div>
          </div>
          <p className="text-text-tertiary text-sm font-medium">No cases currently assigned for field verification.</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-600">
          <Inbox className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-bold">No cases currently assigned to agents</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-panel overflow-hidden">
      <div className="px-10 py-6 border-b border-border-subtle bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-12">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-black text-text-primary tracking-tight uppercase">Case Tracker</h2>
              <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full">
                <Smartphone className="w-3 h-3 text-cyan-400" />
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Case Tracker</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest">
              {cases.length} Active Assignments
           </p>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Case Sidebar - Mission Control Styling */}
        <div className="w-80 border-r border-border-subtle bg-slate-900/50 flex flex-col overflow-hidden">
          {/* Latest Assigned Case Header */}
          <div className="p-8 border-b border-border-subtle bg-brand-indigo/5">
             <div className="flex items-center gap-2 mb-4">
               <div className="w-2 h-2 rounded-full bg-brand-indigo animate-pulse" />
               <h3 className="text-[10px] font-black text-brand-indigo uppercase tracking-[0.2em]">Latest Assignment</h3>
             </div>
             
             <button
               onClick={() => {
                 setSelectedAgentCaseId(latestCase.id);
                 onSelectCase(latestCase.id);
                 setActiveTab('cases');
               }}
               className={cn(
                 "w-full text-left p-6 rounded-2xl border-2 transition-all group relative overflow-hidden shadow-2xl",
                 selectedAgentCaseId === latestCase.id 
                   ? "bg-slate-900 border-brand-indigo shadow-brand-indigo/10" 
                   : "bg-slate-950 border-white/5 hover:border-brand-indigo/30"
               )}
             >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">{latestCase.id}</span>
                  <div className="px-2 py-0.5 bg-brand-indigo/10 rounded border border-brand-indigo/20 text-[9px] font-black text-brand-indigo uppercase">New</div>
                </div>
                <h4 className="text-xl font-black text-white mb-2 leading-tight tracking-tight">{latestCase.location.name}</h4>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                  <MapPin className="w-3.5 h-3.5" />
                  {latestCase.location.city}
                </div>
                
                <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Clock className="w-3.5 h-3.5 text-slate-600" />
                     <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{format(latestCase.timestamp, 'HH:mm • MMM d')}</span>
                   </div>
                   <ArrowRight className="w-4 h-4 text-slate-700 group-hover:translate-x-1 transition-transform" />
                </div>
             </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 pb-2">
               <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4">Recent Queue</h3>
            </div>
            {remainingCases.map(c => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedAgentCaseId(c.id);
                  onSelectCase(c.id);
                  setActiveTab('cases');
                }}
                className={cn(
                  "w-full px-8 py-5 border-b border-white/[0.03] text-left transition-all relative group flex items-center justify-between",
                  selectedAgentCaseId === c.id ? "bg-white/[0.03]" : "hover:bg-white/[0.01]"
                )}
              >
                {selectedAgentCaseId === c.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-brand-indigo" />}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1.5 opacity-50">
                    <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">{c.id}</span>
                    <span className="text-[8px] text-slate-600 font-bold">• {format(c.timestamp, 'HH:mm')}</span>
                  </div>
                  <h4 className="text-sm font-black text-slate-300 mb-1 truncate group-hover:text-white transition-colors">{c.location.name}</h4>
                  <div className="flex items-center gap-2 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                    <span>{c.location.city}</span>
                    <span className="text-emerald-500/60 font-black">₹{(c.recoverableValue / 1000).toFixed(0)}k</span>
                  </div>
                </div>
                <ArrowRight className="w-3 h-3 text-slate-800 group-hover:text-slate-500 transition-colors shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
           <div className="p-8 border-b border-white/5 flex items-center justify-between bg-slate-900/50 z-10 relative">
              <div>
                 <h3 className="text-xl font-black text-white tracking-tight mb-1">Route Pathing</h3>
                 <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{routeCaseIds.length} Locations in Sequence</p>
              </div>
              <div className="flex gap-4">
                {routeCaseIds.length > 1 && (
                  <button 
                    onClick={() => setShowPath(!showPath)}
                    className={cn(
                      "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                      showPath 
                        ? "bg-brand-indigo text-white shadow-lg shadow-brand-indigo/20" 
                        : "bg-white/5 text-text-secondary border border-white/10 hover:bg-white/10"
                    )}
                  >
                    <Navigation className="w-3 h-3" />
                    {showPath ? "Hide Path" : "Create Route"}
                  </button>
                )}
                <button 
                  onClick={() => {
                    setRouteCaseIds([]);
                    setShowPath(false);
                  }}
                  className="px-6 py-2.5 text-[10px] font-black text-red-400 uppercase tracking-widest hover:bg-red-400/10 border border-red-400/20 rounded-xl transition-all"
                >
                  Clear Route
                </button>
              </div>
           </div>
           
           <div className="flex-1 relative z-0">
              <MapContainer center={[19.0760, 72.8777]} zoom={12} scrollWheelZoom={true} className="h-full w-full">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                <MapAutoBounds points={routeCases.map(c => [c.location.lat, c.location.lng])} />
                {showPath && routeCases.length > 1 && (
                  <Polyline 
                    positions={routeCases.map(c => [c.location.lat, c.location.lng] as [number, number])} 
                    color="#6366f1" 
                    weight={3}
                    opacity={0.8}
                    dashArray="10, 10"
                  />
                )}
                {routeCases.map((c, idx) => {
                  const markerIcon = L.divIcon({
                    className: 'custom-marker-icon',
                    html: `<div class="marker-pin-wrapper" style="position: relative; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));">
                             <div style="background-color: #6366f1; color: white; width: 36px; height: 36px; border-radius: 12px; border: 2px solid #0f172a; display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translateY(0); transition: transform 0.2s ease;">
                               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 1px;"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                               <span style="font-size: 9px; font-weight: 900; line-height: 1; letter-spacing: -0.02em;">${idx + 1}</span>
                             </div>
                             <div style="width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 7px solid #6366f1; margin-top: -2px; filter: drop-shadow(0 -1px 0 #0f172a);"></div>
                           </div>`,
                    iconSize: [40, 48],
                    iconAnchor: [20, 44],
                    popupAnchor: [0, -40]
                  });

                  return (
                    <Marker 
                      key={c.id} 
                      position={[c.location.lat, c.location.lng]}
                      icon={markerIcon}
                    >
                      <LeafletTooltip direction="top" offset={[0, -35]} opacity={1}>
                        <div className="px-3 py-1.5 bg-slate-900 text-white rounded-lg border border-white/20 shadow-2xl">
                          <p className="text-[10px] font-black uppercase tracking-widest">{c.location.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-bold text-slate-400">Value:</span>
                            <span className="text-[9px] font-black text-emerald-400">₹{(c.recoverableValue / 1000).toFixed(0)}k</span>
                          </div>
                        </div>
                      </LeafletTooltip>
                      <Popup className="custom-popup">
                        <div className="p-4 min-w-[200px] bg-slate-900 text-white rounded-xl border border-white/10 shadow-2xl">
                          <div className="flex items-center gap-2 mb-3">
                             <span className="w-6 h-6 rounded-lg bg-brand-indigo text-white text-[10px] font-black flex items-center justify-center shadow-lg">{idx + 1}</span>
                             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{c.id}</span>
                          </div>
                          <h4 className="font-black text-white text-base mb-1 tracking-tight">{c.location.name}</h4>
                          <p className="text-[10px] text-slate-400 font-bold mb-4 uppercase tracking-widest">{c.location.address}</p>
                          <div className="flex flex-col gap-2">
                            <button 
                              onClick={() => {
                                onSelectCase(c.id);
                                setActiveTab('cases');
                              }}
                              className="w-full py-2.5 bg-brand-indigo text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg shadow-brand-indigo/20 hover:bg-brand-indigo/90 transition-all border border-brand-indigo/50 mb-1"
                            >
                              Open Case Details
                            </button>
                            <button 
                              onClick={() => removeFromRoute(c.id)}
                              className="w-full py-2 bg-slate-800 text-slate-400 text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-700 hover:text-white transition-all border border-white/5"
                            >
                              Remove Pin
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>

              {/* Route Overlay List */}
              <div className="absolute top-6 right-6 z-10 w-72 max-h-[calc(100%-48px)] overflow-y-auto bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 shadow-2xl space-y-8">
                 <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Route Sequence</h4>
                    <span className="px-2 py-0.5 bg-brand-indigo/20 text-brand-indigo text-[8px] font-black rounded uppercase tracking-widest">{routeCases.length} Stops</span>
                 </div>
                 <div className="space-y-6">
                    {routeCases.map((c, idx) => (
                      <div 
                        key={c.id}
                        className="flex gap-5 group w-full text-left cursor-pointer"
                        onClick={() => onSelectCase(c.id)}
                      >
                         <div className="flex flex-col items-center gap-1 shrink-0">
                            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 text-white text-[10px] font-black flex items-center justify-center transition-all group-hover:border-brand-indigo/50 group-hover:bg-brand-indigo/10">
                               {idx + 1}
                            </div>
                            {idx < routeCases.length - 1 && <div className="w-0.5 flex-1 bg-white/10" />}
                         </div>
                         <div className="flex-1 pb-2 min-w-0">
                            <p className="text-xs font-black text-white group-hover:text-brand-indigo transition-colors mb-1 truncate">{c.location.name}</p>
                            <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{c.location.city}</p>
                         </div>
                         <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromRoute(c.id);
                            }}
                            className="p-2 opacity-0 group-hover:opacity-100 group-hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0 transition-all"
                         >
                            <X className="w-3.5 h-3.5" />
                         </button>
                      </div>
                    ))}
                    {routeCases.length === 0 && (
                      <div className="py-10 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-dashed border-white/10 flex items-center justify-center mx-auto opacity-50">
                          <MapPin className="w-6 h-6 text-slate-500" />
                        </div>
                        <p className="text-[10px] text-slate-500 font-bold italic uppercase tracking-widest">No locations in route</p>
                      </div>
                    )}
                 </div>
              </div>
           </div>

      <AnimatePresence>
        {resolvingCase && (
          <ResolutionModal 
            caseData={resolvingCase}
            onClose={() => setResolvingCase(null)}
            onConfirm={(resNote) => {
              onUpdateStage(resolvingCase.id, 'Ready For Legal', undefined, 'Lawyer', resNote, resolvingCase.assignedTo);
              setResolvingCase(null);
            }}
          />
        )}
      </AnimatePresence>
            </div>
         </div>
      </div>
  );
}

function ResolutionModal({ caseData, onClose, onConfirm }: { caseData: Case, onClose: () => void, onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-bg-panel border border-border-subtle rounded-[32px] shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-border-subtle bg-white/[0.02]">
          <h3 className="text-h3 text-text-primary tracking-tight mb-2">Resolve Case</h3>
          <p className="text-text-tertiary text-sm font-medium">Add your field findings before sending to Litigation.</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-text-quaternary uppercase tracking-widest">Resolution Findings</label>
            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the proof collected or the resolution details..."
              className="w-full h-40 bg-white/[0.02] border border-border-standard rounded-2xl p-4 text-sm text-text-primary focus:ring-1 focus:ring-brand-indigo outline-none transition-all resize-none"
            />
          </div>
        </div>

        <div className="p-8 bg-white/[0.01] border-t border-border-subtle flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-white/[0.02] hover:bg-white/[0.04] text-text-tertiary text-xs font-black uppercase tracking-widest rounded-2xl transition-all border border-border-standard"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(note)}
            disabled={!note.trim()}
            className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-600/20"
          >
            Confirm & Send
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const LEGAL_TEMPLATES = [
  { id: 'standard', name: 'Standard Notice' },
  { id: 'final', name: 'Final Warning' },
  { id: 'escalated', name: 'Escalated Demand' },
  { id: 'settlement', name: 'Settlement Offer' }
];

function LitigationDashboard({ 
  allCases, 
  onSelectCase, 
  onUpdateStage, 
  setActiveTab, 
  onAddComment, 
  addNotification, 
  clearNotification,
  userRole, 
  onDeleteVault, 
  onRequestMoreProof 
}: { 
  allCases: Case[], 
  onSelectCase: (id: string) => void, 
  onUpdateStage: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer', resNote?: string, resAgentName?: string, selectedVaultIds?: string[]) => void, 
  setActiveTab: (tab: string) => void, 
  onAddComment: (id: string, text: string) => void, 
  addNotification: (msg: string, type?: 'major' | 'info') => void,
  clearNotification: (id: string, type: 'comments' | 'major') => void,
  userRole: UserRole,
  onDeleteVault: (caseId: string, vaultId: string) => void,
  onRequestMoreProof: (caseId: string, vaultId: string) => void
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVenueName, setSelectedVenueName] = useState<string | null>(null);
  const [selectedLocalCaseId, setSelectedLocalCaseId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState(LEGAL_TEMPLATES[0]);
  const [isFormulating, setIsFormulating] = useState(false);
  const [detailTab, setDetailTab] = useState<'evidence' | 'threads' | 'formulation' | 'audit'>('evidence');
  const [newComment, setNewComment] = useState('');

  // Auto-clear notifications when viewing relevant tabs
  useEffect(() => {
    if (selectedLocalCaseId) {
      if (detailTab === 'audit') clearNotification(selectedLocalCaseId, 'major');
      if (detailTab === 'threads') clearNotification(selectedLocalCaseId, 'comments');
    }
  }, [detailTab, selectedLocalCaseId, clearNotification]);

  // Clear all when selecting a new case
  const handleSelectLocalCase = (id: string) => {
    setSelectedLocalCaseId(id);
    clearNotification(id, 'major');
    clearNotification(id, 'comments');
  };

  const dossiers = useMemo(() => {
    const groups: Record<string, Case[]> = {};
    const filtered = searchQuery 
      ? allCases.filter(c => 
          c.location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.location.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.id.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : allCases;

    filtered.forEach(c => {
      if (!groups[c.location.name]) groups[c.location.name] = [];
      groups[c.location.name].push(c);
    });

    return Object.entries(groups).map(([name, cases]) => {
      const activeCases = cases.filter(c => c.stage === 'Ready For Legal' || c.stage === 'Recovery In Progress');
      const historicalCases = cases.filter(c => c.stage === 'Closed');
      
      const sortedCases = [...cases].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      const totalInfractions = cases.length;
      let riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
      if (totalInfractions > 5) riskLevel = 'Critical';
      else if (totalInfractions > 3) riskLevel = 'High';
      else if (totalInfractions > 1) riskLevel = 'Medium';

      return {
        venueName: name,
        location: cases[0].location,
        activeCases: activeCases.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
        historicalCases: historicalCases.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
        allCases: sortedCases,
        totalInfractions,
        riskLevel
      };
    }).filter(d => d.activeCases.length > 0);
  }, [allCases, searchQuery]);

  const currentDossier = useMemo(() => {
    if (selectedVenueName) return dossiers.find(d => d.venueName === selectedVenueName) || dossiers[0];
    return dossiers[0];
  }, [selectedVenueName, dossiers]);

  const currentCase = useMemo(() => {
    if (!currentDossier) return null;
    if (selectedLocalCaseId) return currentDossier.allCases.find(c => c.id === selectedLocalCaseId) || currentDossier.activeCases[0];
    return currentDossier.activeCases[0];
  }, [selectedLocalCaseId, currentDossier]);

  const isEvidenceLocked = currentCase ? ['Ready For Legal', 'Recovery In Progress', 'Closed'].includes(currentCase.stage) : false;

  useEffect(() => {
    if (currentDossier && !selectedVenueName) {
      setSelectedVenueName(currentDossier.venueName);
    }
  }, [currentDossier]);

  if (!currentDossier) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-600 bg-slate-950">
        <Inbox className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg font-bold">No venues currently in litigation</p>
      </div>
    );
  }

  const ribbonColor = currentDossier.activeCases.some((c: Case) => c.stage === 'Ready For Legal') ? 'bg-red-500' : 
                     currentDossier.activeCases.some((c: Case) => c.stage === 'Recovery In Progress') ? 'bg-yellow-500' : 'bg-emerald-500';

  const riskColors = {
    Low: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    Medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    High: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    Critical: 'text-red-400 bg-red-400/10 border-red-400/20'
  };

  return (
    <div className="h-full flex overflow-hidden bg-bg-panel">
      {/* Column 1: Venue Navigation */}
      <div className="w-64 border-r border-border-subtle flex flex-col bg-white/[0.01] overflow-hidden">
        <div className="p-6 border-b border-border-subtle">
          <h2 className="text-[10px] font-black text-text-quaternary uppercase tracking-[0.2em] mb-4">Venues</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-quaternary" />
            <input 
              type="text" 
              placeholder="Filter..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white/[0.02] border border-border-standard rounded-md text-[11px] text-text-primary focus:ring-1 focus:ring-brand-indigo outline-none transition-all"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {dossiers.map((d) => (
            <button
              key={d.venueName}
              onClick={() => {
                setSelectedVenueName(d.venueName);
                setSelectedLocalCaseId(null);
              }}
              className={cn(
                "w-full text-left p-4 border-b border-border-subtle transition-all relative group",
                selectedVenueName === d.venueName ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
              )}
            >
              {selectedVenueName === d.venueName && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent-violet" />}
              <div className="flex justify-between items-start mb-1">
                <span className="text-[11px] font-bold text-text-primary truncate flex-1">{d.venueName}</span>
                <span className={cn("w-1.5 h-1.5 rounded-full mt-1", 
                  d.activeCases.some(c => c.stage === 'Ready For Legal') ? 'bg-red-500' : 'bg-emerald-500'
                )} />
              </div>
              <div className="flex items-center gap-2 text-[9px] text-text-tertiary font-bold uppercase tracking-widest">
                <span>{d.location.city}</span>
                <span>•</span>
                <span>{d.totalInfractions} Cases</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Column 2: Venue Summary & Case List */}
      <div className="w-80 border-r border-border-subtle flex flex-col bg-white/[0.005] overflow-hidden">
        <div className="p-6 border-b border-border-subtle space-y-4">
          <div>
            <h3 className="text-h3 text-text-primary tracking-tight mb-1">{currentDossier.venueName}</h3>
            <div className="flex items-center gap-2 text-tiny text-text-tertiary font-bold uppercase tracking-widest">
              <span className={cn("px-1.5 py-0.5 rounded border text-[9px]", riskColors[currentDossier.riskLevel as keyof typeof riskColors])}>
                {currentDossier.riskLevel} Risk
              </span>
              <span>₹{(currentDossier.allCases.reduce((acc: number, c: Case) => acc + c.recoverableValue, 0) / 1000).toFixed(0)}k Potential</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h4 className="text-[9px] font-black text-text-quaternary uppercase tracking-widest mb-3 px-2">Active Infractions</h4>
            <div className="space-y-1.5">
              {currentDossier.activeCases.map((c: Case) => (
                <button 
                  key={c.id}
                  onClick={() => handleSelectLocalCase(c.id)}
                  className={cn(
                    "w-full p-3 rounded-lg border transition-all text-left group relative",
                    (selectedLocalCaseId === c.id || (!selectedLocalCaseId && currentDossier.activeCases[0].id === c.id))
                      ? "bg-white/[0.04] border-border-subtle" 
                      : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-border-standard"
                  )}
                >
                  {c.unreadMajorChanges && (
                    <span className="w-2 h-2 bg-red-500 rounded-full absolute top-3 right-3 shadow-lg shadow-red-500/50 animate-pulse z-10" />
                  )}
                  {c.unreadComments && !c.unreadMajorChanges && (
                    <span className="w-1.5 h-1.5 bg-brand-indigo rounded-full absolute top-3 right-3 shadow-lg z-10" />
                  )}
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">{c.id}</span>
                    <span className="text-[9px] text-text-quaternary font-bold">{format(c.timestamp, 'MMM d')}</span>
                  </div>
                  <h5 className="text-[11px] font-semibold text-text-primary truncate">{c.songAssessment.title}</h5>
                </button>
              ))}
            </div>
          </div>

          {currentDossier.historicalCases.length > 0 && (
            <div>
              <h4 className="text-[9px] font-black text-text-quaternary uppercase tracking-widest mb-3 px-2">Historical</h4>
              <div className="space-y-1.5">
                {currentDossier.historicalCases.map((c: Case) => (
                  <button 
                    key={c.id}
                    onClick={() => setSelectedLocalCaseId(c.id)}
                    className={cn(
                      "w-full p-3 rounded-lg border transition-all text-left group relative",
                      selectedLocalCaseId === c.id 
                        ? "bg-white/[0.04] border-border-subtle" 
                        : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-border-standard"
                    )}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{c.id}</span>
                      <span className="text-[9px] text-text-quaternary font-bold">{format(c.timestamp, 'MMM d')}</span>
                    </div>
                    <h5 className="text-[11px] font-semibold text-text-primary truncate">{c.songAssessment.title}</h5>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Column 3: Case Detail & Legal Formulation */}
      <div className="flex-1 overflow-y-auto bg-bg-panel p-12">
        {currentCase ? (
          <div className="max-w-4xl mx-auto space-y-12">
            {/* Consolidated Case Dossier Header - Minimal Professional Styling */}
            <div className="p-10 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden">
              <div className="relative z-10 space-y-10">
                <div className="flex justify-between items-start">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="px-3 py-1 bg-slate-950 text-slate-400 text-[10px] font-mono font-bold tracking-widest uppercase rounded border border-white/5">
                        {currentCase.id}
                      </span>
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                        Recorded {format(currentCase.timestamp, 'MMM d, yyyy • HH:mm')}
                      </span>
                    </div>
                    <h3 className="text-4xl font-black text-white tracking-tight leading-none">
                      {currentCase.songAssessment.title}
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-slate-400">
                        <Music className="w-5 h-5 text-brand-indigo" />
                        <span className="text-lg font-bold">{currentCase.songAssessment.artists.join(', ')}</span>
                      </div>
                      <span className="h-1 w-1 rounded-full bg-border-standard" />
                      <span className="text-text-tertiary font-medium uppercase tracking-widest text-xs">{currentCase.musicLabel}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-text-quaternary uppercase tracking-widest mb-2">Recoverable Value</p>
                    <div className="flex items-baseline justify-end gap-2">
                      <span className="text-5xl font-black text-text-primary tracking-tighter">₹{currentCase.recoverableValue.toLocaleString()}</span>
                    </div>
                    <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">High Recovery Probability</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-12 pt-10 border-t border-white/5">
                  <div className="space-y-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Forensic Identifiers</p>
                    <div className="space-y-4 font-mono">
                      <div className="p-3 bg-slate-950 rounded border border-white/5 hover:border-slate-800 transition-colors">
                        <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1">ISRC_CODE</p>
                        <p className="text-[12px] font-black text-slate-300 tracking-tight">{currentCase.songAssessment.isrc}</p>
                      </div>
                      <div className="p-3 bg-slate-950 rounded border border-white/5 hover:border-slate-800 transition-colors">
                        <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1">UPC_EAN</p>
                        <p className="text-[12px] font-black text-slate-300 tracking-tight">{currentCase.songAssessment.upc}</p>
                      </div>
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">REG_ASSOC</p>
                        <p className="text-[10px] font-black text-brand-indigo uppercase tracking-widest">{currentCase.songAssessment.rightsAssociation}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Establishment Entity</p>
                    <div className="space-y-5">
                      <div>
                        <p className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1">Legal Name</p>
                        <p className="text-base font-black text-white leading-tight">{currentCase.location.name}</p>
                      </div>
                      <div className="space-y-3">
                         <div className="flex items-start gap-2.5">
                           <MapPin className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                           <p className="text-[11px] font-bold text-slate-400 leading-relaxed">{currentCase.location.address}</p>
                         </div>
                         <div className="flex items-center gap-2.5">
                           <Phone className="w-4 h-4 text-slate-600 shrink-0" />
                           <p className="text-[11px] font-bold text-slate-400 font-mono tracking-tighter">{currentCase.location.phone}</p>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Litigation Status</p>
                    <div className="space-y-4">
                      <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                          <div className="flex items-center gap-2.5">
                             <div className={cn("w-2 h-2 rounded-full", currentCase.stage === 'Closed' ? "bg-emerald-500" : "bg-red-500")} />
                             <span className="text-[11px] font-black text-white uppercase tracking-widest">{currentCase.stage}</span>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-slate-700">Ver 1.0.4</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded bg-slate-950 flex items-center justify-center border border-white/5 text-[12px] font-black text-slate-400">
                            {getPersonInitial(currentCase.assignedTo, 'L')}
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Assigned Counsel</p>
                            <p className="text-[13px] font-black text-slate-300">{currentCase.assignedTo || 'Unassigned'}</p>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          onSelectCase(currentCase.id);
                          setActiveTab('cases');
                        }}
                        className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-slate-800"
                      >
                        View Full Dossier
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-8 border-b border-border-subtle mb-8">
              <button 
                onClick={() => setDetailTab('evidence')}
                className={cn(
                  "pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative",
                  detailTab === 'evidence' ? "text-text-primary" : "text-text-quaternary hover:text-text-secondary"
                )}
              >
                Evidence & Intelligence
                {detailTab === 'evidence' && <motion.div layoutId="lit-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-indigo" />}
              </button>
              <button 
                onClick={() => setDetailTab('threads')}
                className={cn(
                  "pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative flex items-center gap-2",
                  detailTab === 'threads' ? "text-text-primary" : "text-text-quaternary hover:text-text-secondary"
                )}
              >
                Internal Threads
                {currentCase.unreadComments && <div className="w-1.5 h-1.5 rounded-full bg-brand-indigo" />}
                {detailTab === 'threads' && <motion.div layoutId="lit-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-indigo" />}
              </button>
              <button 
                onClick={() => setDetailTab('formulation')}
                className={cn(
                  "pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative flex items-center gap-2",
                  detailTab === 'formulation' ? "text-text-primary" : "text-text-quaternary hover:text-text-secondary"
                )}
              >
                Legal Formulation
                {detailTab === 'formulation' && <motion.div layoutId="lit-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-indigo" />}
              </button>
              <button 
                onClick={() => setDetailTab('audit')}
                className={cn(
                  "pb-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all relative flex items-center gap-2",
                  detailTab === 'audit' ? "text-text-primary" : "text-text-quaternary hover:text-text-secondary"
                )}
              >
                Status Audit Trail
                {detailTab === 'audit' && <motion.div layoutId="lit-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-indigo" />}
              </button>
            </div>

            {detailTab === 'evidence' ? (
              <div className="space-y-12">
                {/* 01: Forensic Intelligence Sheet */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[12px] font-black text-white uppercase tracking-[0.3em] mb-1">Primary Infraction intelligence</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Forensic Video Analysis & Neural Verdict</p>
                    </div>
                    <div className="text-right">
                       <span className="text-[10px] font-mono font-bold text-slate-600 block mb-1">RECORD_ID: {currentCase.id}</span>
                       <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-widest">Class A Evidence</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-1 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
                    {/* Visual Proof */}
                    <div className="lg:col-span-8 bg-black relative">
                      <video 
                        src={currentCase.videoProofUrl} 
                        className="w-full h-full object-cover"
                        controls
                      />
                      <div className="absolute top-6 left-6 flex items-center gap-3">
                         <div className="px-3 py-1.5 bg-black/80 backdrop-blur-md rounded border border-white/10 flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                           <span className="text-[9px] font-black text-white uppercase tracking-widest">LIVE_FORENSIC_STREAM</span>
                         </div>
                      </div>
                    </div>

                    {/* AI Forensic Analysis */}
                    <div className="lg:col-span-4 p-10 bg-slate-900 flex flex-col justify-between border-l border-slate-800">
                      <div className="space-y-8">
                        <div>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Neural Assessment</p>
                          <div className="p-6 bg-slate-950 rounded-2xl border border-white/[0.03]">
                            <p className="text-[13px] text-slate-300 font-medium italic leading-relaxed">
                              "{currentCase.aiExplanation}"
                            </p>
                          </div>
                        </div>

                        <div className="space-y-4">
                           <div className="flex justify-between items-end">
                              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Track Match</p>
                              <p className={cn("text-xl font-black tracking-tighter", isTrackIdentified(currentCase) ? "text-emerald-400" : "text-red-400")}>{trackIdentityLabel(currentCase)}</p>
                           </div>
                        </div>
                      </div>

                      <div className="pt-8 grid grid-cols-2 gap-x-6 gap-y-4">
                        {Object.entries(currentCase.trustGates).slice(0, 4).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2 border-b border-white/[0.03] pb-2">
                            <div className={cn("w-1.5 h-1.5 rounded-full", value ? "bg-emerald-500" : "bg-slate-800")} />
                            <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter truncate">{key.replace(/([A-Z])/g, ' $1')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 02: Verification Matrix & Packages */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                   {/* Verification Gates */}
                   <div className="lg:col-span-1 space-y-6">
                      <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] border-b border-white/5 pb-4">Verification Matrix</h4>
                      <div className="space-y-4">
                         {Object.entries(currentCase.trustGates).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-xl border border-white/5">
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{key.replace(/([A-Z])/g, ' $1')}</span>
                               <span className={cn(
                                 "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                                 value ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                               )}>
                                 {value ? "Verified" : "Failed"}
                               </span>
                            </div>
                         ))}
                      </div>
                   </div>

                   {/* Master Archive Snapshot */}
                   <div className="lg:col-span-2 space-y-6">
                      <div className="flex items-center justify-between border-b border-white/5 pb-4">
                        <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Package Intelligence</h4>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{currentCase.evidenceVaults.length} Vaults Available</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {currentCase.evidenceVaults.map(vault => {
                          const isSelected = currentCase.selectedVaultIds?.includes(vault.id);
                          return (
                            <div 
                              key={vault.id} 
                              className={cn(
                                "p-6 transition-all border rounded-2xl flex flex-col justify-between group h-40",
                                isSelected 
                                  ? "bg-slate-900 border-brand-indigo/30 shadow-2xl shadow-brand-indigo/5" 
                                  : "bg-slate-950/30 border-white/[0.03] opacity-40 grayscale"
                              )}
                            >
                              <div className="flex justify-between items-start">
                                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                                   <Video className="w-5 h-5 text-slate-400" />
                                </div>
                                <span className="text-[8px] font-mono text-slate-600">{vault.id}</span>
                              </div>
                              <div>
                                <h5 className="text-[13px] font-black text-white mb-1">{vault.name}</h5>
                                <div className="flex items-center gap-2">
                                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Asset Locked</span>
                                  <div className="w-1 h-1 rounded-full bg-slate-700" />
                                  <span className="text-[9px] font-bold text-brand-indigo uppercase tracking-widest">Active</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                   </div>
                </div>

                {/* 03: Minimal Audit Trail Snapshot */}
                <div className="p-10 bg-slate-900/50 rounded-3xl border border-white/[0.03] relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-8 opacity-[0.02]">
                      <Activity className="w-32 h-32 text-white" />
                   </div>
                   <div className="relative z-10">
                      <div className="flex items-center justify-between mb-10">
                         <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Critical Lifecycle Path</h4>
                         <button onClick={() => setDetailTab('audit')} className="text-[9px] font-black text-brand-indigo uppercase tracking-widest hover:text-white transition-colors">Inspect Full Ledger</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        {currentCase.auditTrail.slice(-3).reverse().map((entry, idx) => (
                          <div key={idx} className="relative group">
                            <div className="flex items-center gap-3 mb-3">
                               <div className={cn("w-1.5 h-1.5 rounded-full", idx === 0 ? "bg-brand-indigo" : "bg-slate-700")} />
                               <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{format(new Date(entry.timestamp), 'MMM d, HH:mm')}</span>
                            </div>
                            <p className="text-sm font-black text-slate-300 group-hover:text-white transition-colors mb-1">{entry.action}</p>
                            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{entry.actor}</p>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>
              </div>
            ) : detailTab === 'threads' ? (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black text-text-quaternary uppercase tracking-[0.2em]">Internal Discussion</h4>
                  <span className="text-[10px] font-bold text-text-quaternary uppercase tracking-widest">{currentCase.comments.length} Messages</span>
                </div>

                <div className="space-y-6 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                  {currentCase.comments.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-text-quaternary/20">
                      <MessageSquare className="w-12 h-12 mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">No internal threads yet</p>
                    </div>
                  ) : (
                    currentCase.comments.map((comment) => (
                      <div key={comment.id} className="flex gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black text-white shrink-0",
                          comment.role === 'Admin' ? "bg-brand-indigo" : comment.role === 'Lawyer' ? "bg-emerald-600" : "bg-cyan-600"
                        )}>
                          {comment.author[0]}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-text-primary">{comment.author}</span>
                              <span className="text-[9px] font-black text-text-quaternary uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/[0.04] border border-border-standard">
                                {comment.role}
                              </span>
                            </div>
                            <span className="text-[10px] text-text-quaternary font-bold">{format(comment.timestamp, 'MMM d, p')}</span>
                          </div>
                          <div className="p-4 bg-white/[0.02] border border-border-standard rounded-2xl rounded-tl-none">
                            <p className="text-sm text-text-secondary leading-relaxed">{comment.text}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="pt-8 border-t border-border-subtle">
                  <div className="relative">
                    <textarea 
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Add an internal note or legal observation..."
                      className="w-full h-32 bg-white/[0.02] border border-border-standard rounded-3xl p-6 text-sm text-text-primary focus:ring-1 focus:ring-brand-indigo outline-none transition-all resize-none pr-16"
                    />
                    <button 
                      onClick={() => {
                        if (newComment.trim()) {
                          onAddComment(currentCase.id, newComment);
                          setNewComment('');
                        }
                      }}
                      disabled={!newComment.trim()}
                      className="absolute bottom-6 right-6 w-10 h-10 bg-brand-indigo hover:bg-brand-indigo/90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-brand-indigo/20"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-4 text-[9px] text-text-quaternary font-bold uppercase tracking-widest text-center">
                    Notes added here are only visible to the legal and operations team.
                  </p>
                </div>
              </div>
            ) : detailTab === 'audit' ? (
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-black text-text-quaternary uppercase tracking-[0.2em]">Case Status Audit Trail</h4>
                  <span className="text-[10px] font-bold text-text-quaternary uppercase tracking-widest">{currentCase.auditTrail.length} Logged Updates</span>
                </div>
                
                <div className="bg-white/[0.02] border border-border-standard rounded-[40px] p-10 relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-brand-indigo/5 to-transparent pointer-events-none opacity-20" />
                  
                  <div className="relative space-y-12">
                    {currentCase.auditTrail.slice().reverse().map((entry, idx) => {
                      const isMajor = entry.action === "Evidence Vault Created" || entry.action === "Case Resolved" || entry.action === "Status Transition";
                      
                      return (
                        <div key={entry.id} className="relative pl-10 border-l border-border-standard/50 pb-2 last:pb-0">
                          {/* Indicator Dot */}
                          <div className={cn(
                            "absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-bg-panel",
                            isMajor ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-text-quaternary"
                          )} />
                          
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                  "bg-white/5 text-text-quaternary border border-border-standard"
                                )}>
                                  {entry.action}
                                </span>
                                <span className="text-[10px] text-text-quaternary/50 font-bold">•</span>
                                <span className="text-[10px] text-text-quaternary font-bold uppercase tracking-widest">{entry.actor}</span>
                                {entry.eventType && (
                                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-brand-indigo/10 text-brand-indigo rounded uppercase tracking-widest">
                                    {entry.eventType}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-text-quaternary font-bold">{format(new Date(entry.timestamp), 'MMM d, HH:mm:ss')}</span>
                            </div>
                            
                            <p className="text-sm text-text-secondary font-medium leading-relaxed max-w-2xl">
                              {entry.details}
                            </p>

                            {entry.newStage && entry.previousStage !== entry.newStage && (
                              <div className="flex items-center gap-2 pt-2">
                                <span className="text-[8px] font-black text-text-quaternary uppercase tracking-widest">Stage Evolution:</span>
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-white/5 rounded text-[8px] font-black text-text-tertiary uppercase tracking-widest">{entry.previousStage}</span>
                                  <ArrowRight className="w-2 h-2 text-text-quaternary" />
                                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[8px] font-black text-emerald-400 uppercase tracking-widest">{entry.newStage}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="p-10 bg-white/[0.02] rounded-[40px] border border-border-standard relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-brand-indigo/5 blur-[100px] -mr-32 -mt-32" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-brand-indigo flex items-center justify-center shadow-xl shadow-brand-indigo/20">
                        <Gavel className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-brand-indigo uppercase tracking-widest mb-1">AI Legal Engine</p>
                        <h4 className="text-2xl font-black text-text-primary tracking-tight">Formulation Strategy</h4>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-10">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-text-quaternary uppercase tracking-widest">Notice Template</label>
                        <div className="grid grid-cols-2 gap-3">
                          {LEGAL_TEMPLATES.map(t => (
                            <button
                              key={t.id}
                              onClick={() => setSelectedTemplate(t)}
                              className={cn(
                                "p-4 rounded-2xl border text-left transition-all",
                                selectedTemplate.id === t.id 
                                  ? "bg-brand-indigo/10 border-brand-indigo/40 text-brand-indigo" 
                                  : "bg-white/[0.02] border-border-standard text-text-tertiary hover:bg-white/[0.04]"
                              )}
                            >
                              <p className="text-[10px] font-black uppercase tracking-widest">{t.name}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-text-quaternary uppercase tracking-widest">Recovery Parameters</label>
                        <div className="p-6 bg-white/[0.02] border border-border-standard rounded-2xl space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-text-tertiary">Statutory Damages</span>
                            <span className="text-xs font-black text-text-primary">₹{currentCase.recoverableValue.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-text-tertiary">Legal Fees (Est.)</span>
                            <span className="text-xs font-black text-text-primary">₹12,500</span>
                          </div>
                          <div className="pt-4 border-t border-border-subtle flex justify-between items-center">
                            <span className="text-xs font-black text-brand-indigo uppercase tracking-widest">Total Demand</span>
                            <span className="text-sm font-black text-text-primary">₹{(currentCase.recoverableValue + 12500).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <button 
                        onClick={() => {
                          setIsFormulating(true);
                          setTimeout(() => {
                            setIsFormulating(false);
                            addNotification(`Legal Notice Generated for ${currentCase.id}`, 'info');
                          }, 2000);
                        }}
                        disabled={isFormulating}
                        className="w-full py-6 bg-brand-indigo text-white text-xs font-black uppercase tracking-[0.2em] rounded-[24px] shadow-2xl shadow-brand-indigo/30 hover:bg-brand-indigo/90 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {isFormulating ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Synthesizing Legal Strategy...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" />
                            Generate Legal Notice
                          </>
                        )}
                      </button>

                      {/* Generated Notice Preview */}
                      <AnimatePresence>
                        {!isFormulating && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-8 bg-slate-950 rounded-3xl border border-border-standard font-mono text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar"
                          >
                            {generateLegalNotice(currentCase, currentDossier, selectedTemplate)}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <p className="text-center text-[9px] font-bold text-text-quaternary uppercase tracking-widest">
                        Strategy based on IPRS statutory guidelines and venue infraction history.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-10 bg-white/[0.02] rounded-[40px] border border-border-standard">
                  <div className="flex items-center gap-3 mb-8">
                    <FileText className="w-5 h-5 text-brand-indigo" />
                    <p className="text-[10px] font-black text-text-quaternary uppercase tracking-widest">Strategy Preview</p>
                  </div>
                  <div className="space-y-6">
                    <div className="h-4 w-3/4 bg-white/[0.05] rounded-full animate-pulse" />
                    <div className="h-4 w-full bg-white/[0.05] rounded-full animate-pulse delay-75" />
                    <div className="h-4 w-5/6 bg-white/[0.05] rounded-full animate-pulse delay-150" />
                    <div className="h-4 w-2/3 bg-white/[0.05] rounded-full animate-pulse delay-300" />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-slate-600">
            <Inbox className="w-16 h-16 mb-4 opacity-10" />
            <p className="text-lg font-bold uppercase tracking-widest opacity-20">Select a case to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function generateLegalNotice(caseData: Case, dossier: any, template: typeof LEGAL_TEMPLATES[0]) {
  const date = format(new Date(), 'MMMM d, yyyy');
  const pastInfractions = dossier.historicalCases.length;
  
  let header = "LEGAL NOTICE OF COPYRIGHT INFRINGEMENT";
  let body = "";

  if (template.id === 'escalated') {
    header = "ESCALATED DEMAND: NOTICE OF INTENT TO SUE";
    body = `As a repeat offender with ${pastInfractions} prior recorded infractions, your establishment is now subject to escalated legal proceedings. We have documented continuous non-compliance with music licensing regulations.`;
  } else if (template.id === 'final') {
    header = "FINAL PRE-LITIGATION WARNING";
    body = "This is your final notice before we initiate formal litigation in the High Court. All evidence has been forensically sealed and is ready for submission.";
  } else if (template.id === 'settlement') {
    header = "SETTLEMENT OFFER & RELEASE OF LIABILITY";
    body = "In the interest of resolving this matter without costly litigation, we are prepared to offer a one-time settlement release upon payment of the demanded sum.";
  } else {
    const mandateProfile = getViolationMandateProfile(caseData);
    body = `This formal notice is issued regarding unauthorized ${mandateProfile.label.toLowerCase()} at your establishment. Our forensic systems have verified an infraction on ${format(caseData.timestamp, 'PPPP')} at ${format(caseData.timestamp, 'p')}.`;
  }
  
  return `${header}
Date: ${date}

TO: Management of ${dossier.venueName}
ADDRESS: ${dossier.location.address}, ${dossier.location.city}

RE: Formal Demand for Compensation - Case ${caseData.id}

Dear Management,

${body}

INFRACTION DETAILS:
- Track Title: ${caseData.songAssessment.title}
- Artist: ${caseData.songAssessment.artists.join(', ')}
- Rights Holder: ${caseData.musicLabel}
- Track Identification: ${trackIdentityLabel(caseData)}

HISTORY OF NON-COMPLIANCE:
Records indicate that ${dossier.venueName} has ${pastInfractions > 0 ? `${pastInfractions} previous recorded infractions` : 'no prior recorded infractions'}.

DEMAND:
We hereby demand immediate settlement of ₹${caseData.recoverableValue.toLocaleString()} to avoid further litigation. Failure to respond within 7 business days will result in a formal suit filed in the appropriate jurisdiction.

Sincerely,
Legal Recovery Department
Forensic Music Rights Management`;
}

function AssignmentCard({ caseData, onSelectCase, onUpdateStage, setActiveTab, onOpenResolvedModal }: { caseData: Case, key?: string, onSelectCase?: (id: string) => void, onUpdateStage?: (id: string, stage: CaseStage, notes?: string, type?: 'Agent' | 'Lawyer', resNote?: string, resAgentName?: string) => void, setActiveTab?: (tab: string) => void, onOpenResolvedModal?: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/[0.02] border border-border-standard rounded-xl p-8 shadow-sm hover:border-border-subtle transition-all group"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex flex-col">
          <span className="text-tiny font-black text-text-quaternary uppercase tracking-widest mb-1">{caseData.id}</span>
          <h4 className="text-h3 text-text-primary tracking-tight mb-2">{caseData.location.name}</h4>
          
          <div className="flex gap-4">
             <div className="group/tooltip relative">
                <MapPin className="w-4 h-4 text-text-quaternary hover:text-accent-violet cursor-help transition-colors" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tooltip:block z-50 w-48 p-3 bg-bg-surface border border-border-standard rounded-lg shadow-2xl text-tiny font-bold text-text-secondary leading-relaxed">
                   <p className="text-accent-violet uppercase tracking-widest mb-1 text-[8px]">Venue Address</p>
                   {caseData.location.address}
                </div>
             </div>
             <div className="group/tooltip relative">
                <Phone className="w-4 h-4 text-text-quaternary hover:text-accent-violet cursor-help transition-colors" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tooltip:block z-50 w-40 p-3 bg-bg-surface border border-border-standard rounded-lg shadow-2xl text-tiny font-bold text-text-secondary">
                   <p className="text-accent-violet uppercase tracking-widest mb-1 text-[8px]">Contact Number</p>
                   {caseData.location.phone}
                </div>
             </div>
             <div className="group/tooltip relative">
                <Mail className="w-4 h-4 text-text-quaternary hover:text-accent-violet cursor-help transition-colors" />
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover/tooltip:block z-50 w-48 p-3 bg-bg-surface border border-border-standard rounded-lg shadow-2xl text-tiny font-bold text-text-secondary">
                   <p className="text-accent-violet uppercase tracking-widest mb-1 text-[8px]">Email Address</p>
                   {caseData.location.email}
                </div>
             </div>
          </div>
        </div>
        <div className="w-10 h-10 rounded-lg bg-white/[0.03] flex items-center justify-center border border-border-subtle">
          {caseData.assignmentType === 'Agent' ? <Smartphone className="w-5 h-5 text-cyan-400" /> : <Gavel className="w-5 h-5 text-emerald-400" />}
        </div>
      </div>

      <div className="space-y-6 mb-8">
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Logged At</p>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-xs font-bold text-white">{format(caseData.timestamp, 'HH:mm')}</p>
            </div>
          </div>
          <div className="p-4 bg-emerald-900/10 rounded-2xl border border-emerald-900/20">
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Recovery</p>
            <div className="flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
              <p className="text-xs font-black text-white">₹{(caseData.recoverableValue / 1000).toFixed(0)}k</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Assigned To</p>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-black text-white">
              {getPersonInitial(caseData.assignedTo)}
            </div>
            <p className="text-sm font-bold text-white">{caseData.assignedTo || 'Unassigned'}</p>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Forensic Summary</p>
          <div className="grid grid-cols-2 gap-3">
             <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-800/30 flex flex-col gap-1">
                <span className="text-[8px] font-black text-slate-600 uppercase">Trust Gates</span>
                <span className="text-[10px] font-bold text-emerald-500">{getTrustPassCount(caseData)}/5 Verified</span>
             </div>
             <div className="p-3 bg-slate-950/30 rounded-xl border border-slate-800/30 flex flex-col gap-1">
                <span className="text-[8px] font-black text-slate-600 uppercase">Track</span>
                <span className="text-[10px] font-bold text-blue-400">{trackIdentityLabel(caseData)}</span>
             </div>
          </div>
        </div>

        {caseData.notes && (
          <div className="p-4 bg-blue-900/10 rounded-2xl border border-blue-900/20">
            <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Assignment Notes</p>
            <p className="text-xs text-slate-300 leading-relaxed italic">"{caseData.notes}"</p>
          </div>
        )}

        {caseData.assignmentType === 'Lawyer' && caseData.agentResolutionNote && (
          <div className="p-4 bg-emerald-900/10 rounded-2xl border border-emerald-900/20">
            <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Agent Resolution Findings</p>
            <p className="text-xs text-slate-300 leading-relaxed italic mb-2">"{caseData.agentResolutionNote}"</p>
            <div className="flex items-center gap-2 pt-2 border-t border-emerald-900/20">
              <div className="w-5 h-5 rounded-full bg-cyan-600 flex items-center justify-center text-[8px] font-black text-white">
                {getPersonInitial(caseData.resolvedByAgentName, 'A')}
              </div>
              <span className="text-[10px] font-bold text-slate-400">Verified by {caseData.resolvedByAgentName || 'Field Agent'}</span>
            </div>
          </div>
        )}
      </div>

      {caseData.assignmentType === 'Agent' ? (
        <div className="flex gap-3">
          <button 
            onClick={() => {
              onSelectCase?.(caseData.id);
              setActiveTab?.('cases');
            }}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all border border-slate-700 shadow-sm active:scale-95"
          >
            Edit
          </button>
          <button 
            onClick={() => onUpdateStage?.(caseData.id, 'Ready For Legal', undefined, 'Lawyer')}
            className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all border border-slate-700 shadow-sm active:scale-95"
          >
            No Change
          </button>
          <button 
            onClick={onOpenResolvedModal}
            className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-emerald-600/20 active:scale-95"
          >
            Resolved
          </button>
        </div>
      ) : (
        <button className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all border border-slate-700 shadow-sm active:scale-95">
          View Full Evidence File
        </button>
      )}
    </motion.div>
  );
}

function InfoItem({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</p>
      <p className="text-sm font-black text-white tracking-tight">{value}</p>
    </div>
  );
}
