/**
 * Activities Module - Data Mappers
 * 活动模块 - 数据映射工具
 * 用于转换 API 响应数据到前端数据模型
 */

import type {
  Activity,
  ActivityRegistrationType,
  RegistrationFormField,
} from "../types";

/**
 * API 返回的活动数据结构（与后端/Mock 一致）
 */
export interface ApiActivityData {
  id: string;
  // snake_case (直接查库) 或 camelCase (后端 mapEventToFrontend)
  organizer_id?: string;
  organizerId?: string;
  title: string;
  description: string;
  cover_image?: string;
  coverImage?: string;
  images?: unknown;
  start_time?: string;
  end_time?: string;
  activityStart?: string;
  activityEnd?: string;
  location: string;
  max_participants?: number;
  capacity?: number;
  fee?: number;
  tags?: string[];
  checkin_password?: string;
  checkinPassword?: string;
  status: string;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  expectation?: string;
  registration_deadline?: string;
  registrationStart?: string;
  registrationEnd?: string;
  enrolledCount?: number;
  currentParticipants?: number;
  occupiedParticipants?: number;
  totalApplications?: number;
  remainingParticipants?: number | null;
  capacitySummary?: Activity["capacitySummary"];
  // 扩展字段
  category?: string;
  requirements?: string;
  contact_info?: string;
  contactInfo?: string;
  is_public?: boolean;
  isPublic?: boolean;
  allow_waitlist?: boolean;
  allowWaitlist?: boolean;
  enable_nfc?: boolean;
  enableNfc?: boolean;
  registration_form_schema?: RegistrationFormField[] | null;
  registrationFormSchema?: RegistrationFormField[] | null;
  registrationTypes?: ActivityRegistrationType[];
}

/**
 * 将 API 活动数据映射为前端 Activity 类型
 */
export const mapApiActivityToActivity = (
  apiActivity: ApiActivityData
): Activity => {
  try {
    const createdAt = apiActivity.createdAt || apiActivity.created_at || "";
    const updatedAt = apiActivity.updatedAt || apiActivity.updated_at || "";
    const activityStart = apiActivity.activityStart || apiActivity.start_time || "";
    const activityEnd = apiActivity.activityEnd || apiActivity.end_time || "";
    const coverImage = apiActivity.coverImage || apiActivity.cover_image || "";
    const images = Array.isArray(apiActivity.images)
      ? apiActivity.images.filter(
          (image): image is string =>
            typeof image === "string" && image.trim().length > 0,
        )
      : [];

    const result: Activity = {
      id: apiActivity.id,
      title: apiActivity.title,
      description: apiActivity.description,
      coverImage,
      images: images.length > 0 ? images : coverImage ? [coverImage] : [],
      status: mapApiStatus(apiActivity.status),
      registrationStart:
        apiActivity.registrationStart ||
        apiActivity.registration_deadline ||
        createdAt,
      registrationEnd:
        apiActivity.registrationEnd ||
        apiActivity.registration_deadline ||
        activityStart,
      activityStart,
      activityEnd,
      location: apiActivity.location,
      capacity: apiActivity.capacity || apiActivity.max_participants || 0,
      enrolledCount: apiActivity.enrolledCount || 0,
      occupiedParticipants:
        apiActivity.occupiedParticipants ?? apiActivity.currentParticipants ?? 0,
      totalApplications:
        apiActivity.totalApplications ?? apiActivity.enrolledCount ?? 0,
      remainingParticipants: apiActivity.remainingParticipants ?? null,
      capacitySummary: apiActivity.capacitySummary ?? null,
      createdAt,
      updatedAt,
      // 扩展字段
      category: (apiActivity.category || "other") as Activity["category"],
      tags: (apiActivity.tags || []) as Activity["tags"],
      requirements: apiActivity.requirements || apiActivity.expectation,
      contactInfo: apiActivity.contactInfo || apiActivity.contact_info,
      isPublic: apiActivity.isPublic ?? apiActivity.is_public,
      allowWaitlist: apiActivity.allowWaitlist ?? apiActivity.allow_waitlist,
      enableNfc: apiActivity.enableNfc ?? apiActivity.enable_nfc,
      registrationFormSchema:
        apiActivity.registrationFormSchema ??
        apiActivity.registration_form_schema ??
        null,
      registrationTypes: apiActivity.registrationTypes || [],
    };

    return result;
  } catch (error) {
    console.error("活动数据转换失败", error instanceof Error ? error.message : "未知错误");
    throw error;
  }
};

/**
 * 映射 API 状态到前端状态
 */
const mapApiStatus = (apiStatus: string): Activity["status"] => {
  const statusMap: Record<string, Activity["status"]> = {
    draft: "recruiting",
    published: "recruiting",
    ongoing: "ongoing",
    completed: "ended",
    cancelled: "cancelled",
  };

  return statusMap[apiStatus] || "recruiting";
};

/**
 * 批量映射活动列表
 */
export const mapApiActivitiesToActivities = (
  apiActivities: ApiActivityData[]
): Activity[] => {
  return apiActivities.map(mapApiActivityToActivity);
};
