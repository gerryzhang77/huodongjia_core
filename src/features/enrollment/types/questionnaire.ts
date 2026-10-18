export interface RegistrationSummaryItem {
  key: string;
  label: string;
  value: string;
  tags: string[] | null;
}

export interface RegistrationSummary {
  formName: string;
  items: RegistrationSummaryItem[];
  meta: string;
  updatedAt: string | null;
}

export interface QuestionnaireField extends RegistrationSummaryItem {
  type: string;
  sensitive: boolean;
  historical: boolean;
}

export interface EnrollmentQuestionnaire {
  enrollmentId: string;
  registrationTypeName: string;
  updatedAt: string | null;
  answerRevision: number;
  fields: QuestionnaireField[];
}
