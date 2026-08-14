import { api } from "@/services/api";
import type { UserProfile } from "./userApi";

export type NfcTagStatus = "unbound" | "bound" | "disabled" | "lost" | "invalid";

export interface NfcTagInfo {
  tokenPrefix: string | null;
  status: NfcTagStatus;
  ownerUserId: string | null;
  boundAt: string | null;
  label: string | null;
  metadata: Record<string, unknown>;
  displayConfig?: {
    eventId?: string | null;
    participantId?: string | null;
    eventTitle?: string | null;
    registrationTypeName?: string | null;
  };
}

export interface NfcResolveData {
  tag: NfcTagInfo;
  status: NfcTagStatus;
  profile: UserProfile | null;
  viewer: {
    isAuthenticated: boolean;
    isSelf: boolean;
  };
  actions: {
    canBind: boolean;
    requiresLoginToBind: boolean;
    canEdit: boolean;
    canConfigure?: boolean;
    canFollow: boolean;
    canMessage: boolean;
    requiresLoginForSocial: boolean;
  };
}

export interface NfcDisplayEnrollmentOption {
  participantId: string;
  eventId: string;
  eventTitle: string;
  registrationTypeName?: string | null;
  status: string;
  displayName: string;
  createdAt: string;
  selected: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function resolveNfcTag(token: string): Promise<NfcResolveData> {
  const res = await api.get<ApiResponse<NfcResolveData>>(
    `/api/nfc/t/${encodeURIComponent(token)}`,
  );
  return res.data;
}

export async function bindNfcTag(
  token: string,
  displayEventId?: string | null,
): Promise<NfcResolveData> {
  const res = await api.post<ApiResponse<NfcResolveData>>(
    `/api/nfc/t/${encodeURIComponent(token)}/bind`,
    displayEventId ? { displayEventId } : {},
  );
  return res.data;
}

export async function getNfcDisplayEnrollments(token: string): Promise<{
  options: NfcDisplayEnrollmentOption[];
  selectedEventId: string | null;
}> {
  const res = await api.get<ApiResponse<{
    options: NfcDisplayEnrollmentOption[];
    selectedEventId: string | null;
  }>>(`/api/nfc/t/${encodeURIComponent(token)}/enrollments`);
  return res.data;
}

export async function updateNfcDisplayConfig(
  token: string,
  displayEventId: string,
): Promise<NfcResolveData> {
  const res = await api.patch<ApiResponse<NfcResolveData>>(
    `/api/nfc/t/${encodeURIComponent(token)}/config`,
    { displayEventId },
  );
  return res.data;
}
