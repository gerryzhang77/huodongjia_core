import type { RegistrationFormField } from "@/features/activities/types";
import { getIdentityCardFieldError } from "@/features/enrollment/utils/identityCard";

/** Shared by inline feedback and submit; a disabled button must never hide these errors. */
export function getRegistrationErrors(
  fields: RegistrationFormField[],
  answers: Record<string, string | string[]>,
  imageCounts: Record<string, number>,
): Map<string, string> {
  const errors = new Map<string, string>();
  for (const field of fields) {
    const value = answers[field.key];
    let error: string | null = null;
    if (field.type === "image") {
      if (field.required && !(imageCounts[field.key] > 0)) error = `请完成「${field.label}」的图片上传`;
    } else if (field.key === "phone") {
      if (typeof value !== "string" || !/^1[3-9]\d{9}$/.test(value)) error = "请输入正确的 11 位手机号";
    } else if (field.required && (Array.isArray(value) ? !value.some(v => v.trim()) : !value?.trim())) {
      error = `请填写「${field.label}」`;
    } else {
      error = getIdentityCardFieldError(field, value);
      if (!error && ["select", "radio", "multi-select"].includes(field.type) && value?.length) {
        const selected = Array.isArray(value) ? value : [value];
        if (selected.some(option => !field.options?.includes(option))) {
          error = `「${field.label}」的选项已变化，请重新选择`;
        } else if (selected.some(option => field.optionAvailability?.[option]?.isFull && !field.optionAvailability[option].canKeepExisting)) {
          error = `「${field.label}」所选名额已满，请选择其他选项`;
        }
      }
    }
    if (error) errors.set(field.key, error);
  }
  return errors;
}
