import { ChevronRight, ClipboardList } from "lucide-react";
import type { RegistrationSummary } from "../types/questionnaire";

export default function RegistrationSummaryContent({
  summary,
  name,
  registrationTypeName,
  onOpen,
}: {
  summary?: RegistrationSummary;
  name: string;
  registrationTypeName?: string;
  onOpen: () => void;
}) {
  return (
    <section>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
        <ClipboardList size={13} />
        活动报名资料
      </p>
      <p className="mt-1 text-[10px] text-gray-400">仅本活动主办方可见</p>
      {registrationTypeName && (
        <p className="mt-1 break-words text-[11px] text-gray-500">
          报名类型：{registrationTypeName}
        </p>
      )}
      {summary?.formName && summary.formName !== name && (
        <p className="mt-2 break-words text-xs text-gray-700">
          报名姓名：{summary.formName}
        </p>
      )}
      {!!summary?.items.length && (
        <dl className="mt-2 space-y-2">
          {summary.items.map((item) => (
            <div key={item.key}>
              <dt className="text-[10px] text-gray-400">{item.label}</dt>
              <dd className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-gray-700">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-600"
      >
        查看报名问卷
        <ChevronRight size={14} />
      </button>
    </section>
  );
}
