import { describe, expect, it } from "vitest";
import type { RegistrationFormField } from "@/features/activities/types";
import { getRegistrationErrors } from "./registrationValidation";
const field = (patch: Partial<RegistrationFormField>): RegistrationFormField => ({ key: "name", label: "姓名", type: "text", preset: false, required: true, ...patch });

describe("registration validation feedback", () => {
  it("identifies the first missing field and gives phone format feedback", () => {
    const errors = getRegistrationErrors([field({}), field({ key: "phone", label: "手机号" })], { name: " ", phone: "123" }, {});
    expect([...errors.keys()]).toEqual(["name", "phone"]);
    expect(errors.get("phone")).toContain("11 位");
  });
  it("requires a completed upload rather than a local preview", () => {
    const fields = [field({ key: "photo", label: "生活照", type: "image", maxImages: 2 })];
    expect(getRegistrationErrors(fields, { photo: "blob:local-preview" }, {}).get("photo")).toContain("图片上传");
    // maxImages is a maximum, not an additional minimum requirement.
    expect(getRegistrationErrors(fields, {}, { photo: 1 }).size).toBe(0);
  });
  it("detects outdated prefilled choices and quota changes, while allowing an existing reserved option", () => {
    const choice = field({ key: "gender", label: "性别", type: "radio", options: ["男", "女"], optionAvailability: { 男: { isFull: true } } });
    expect(getRegistrationErrors([choice], { gender: "旧选项" }, {}).get("gender")).toContain("重新选择");
    expect(getRegistrationErrors([choice], { gender: "男" }, {}).get("gender")).toContain("已满");
    choice.optionAvailability!.男.canKeepExisting = true;
    expect(getRegistrationErrors([choice], { gender: "男" }, {}).size).toBe(0);
  });
  it("accepts complete answers and optional blanks", () => {
    const fields = [field({}), field({ key: "phone" }), field({ key: "tags", type: "multi-select", options: ["阅读"] }), field({ key: "note", required: false })];
    expect(getRegistrationErrors(fields, { name: "测试", phone: "13800000000", tags: ["阅读"] }, {}).size).toBe(0);
  });
});
