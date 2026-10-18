import { api } from "@/services/api/client";
import type {
  EnrollmentQuestionnaire,
  QuestionnaireField,
} from "../types/questionnaire";

const url = (activityId: string, enrollmentId: string) =>
  `/api/enrollments/${encodeURIComponent(activityId)}/${encodeURIComponent(enrollmentId)}/questionnaire`;

export async function getEnrollmentQuestionnaire(
  activityId: string,
  enrollmentId: string,
  signal?: AbortSignal,
): Promise<EnrollmentQuestionnaire> {
  const response = await api.get<{
    success: boolean;
    data?: EnrollmentQuestionnaire;
    message?: string;
  }>(url(activityId, enrollmentId), { signal });
  if (!response.success || !response.data)
    throw new Error(response.message || "读取报名问卷失败");
  return response.data;
}

export async function revealQuestionnaireField(
  activityId: string,
  enrollmentId: string,
  fieldKey: string,
  signal?: AbortSignal,
): Promise<QuestionnaireField> {
  const response = await api.get<{
    success: boolean;
    data?: { field: QuestionnaireField };
    message?: string;
  }>(url(activityId, enrollmentId), {
    params: { revealField: fieldKey },
    signal,
  });
  if (!response.success || !response.data?.field)
    throw new Error(response.message || "读取答案失败");
  return response.data.field;
}
