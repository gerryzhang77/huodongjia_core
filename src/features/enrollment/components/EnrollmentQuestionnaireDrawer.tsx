import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import PrivateEnrollmentImageGallery from "@/components/enrollment/PrivateEnrollmentImageGallery";
import { useAuthStore } from "@/features/auth/stores";
import {
  getEnrollmentQuestionnaire,
  revealQuestionnaireField,
} from "../services/questionnaireApi";
import type { QuestionnaireField } from "../types/questionnaire";

function Answer({
  field,
  activityId,
  enrollmentId,
}: {
  field: QuestionnaireField;
  activityId: string;
  enrollmentId: string;
}) {
  const [revealed, setRevealed] = useState<QuestionnaireField | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const reveal = async () => {
    if (loading) return;
    if (revealed) {
      setRevealed(null);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(false);
    try {
      const answer = await revealQuestionnaireField(
        activityId,
        enrollmentId,
        field.key,
        controller.signal,
      );
      if (!controller.signal.aborted) setRevealed(answer);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  const answer = revealed || field;
  return (
    <div className="border-b border-gray-100 py-4 last:border-0">
      <dt className="flex items-start justify-between gap-3 text-xs text-gray-500">
        <span className="break-words leading-5">{field.label}</span>
        {field.sensitive && (
          <button
            type="button"
            onClick={reveal}
            disabled={loading}
            aria-label={`${revealed ? "隐藏" : "查看"}${field.label}`}
            className="inline-flex shrink-0 items-center gap-1 text-primary-600 disabled:opacity-50"
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            {loading ? "加载中" : revealed ? "隐藏" : "查看"}
          </button>
        )}
      </dt>
      <dd className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
        {field.sensitive && !revealed ? (
          <span className="text-gray-400">
            {error ? "读取失败，请点击重试" : "敏感信息已隐藏"}
          </span>
        ) : answer.tags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {answer.tags.map((tag, index) => (
              <span
                key={index}
                className="max-w-full rounded-lg bg-gray-100 px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : (
          answer.value
        )}
      </dd>
    </div>
  );
}

interface Props {
  activityId: string;
  enrollmentId: string;
  name: string;
  imageCount?: number;
  onClose: () => void;
}

export default function EnrollmentQuestionnaireDrawer({
  activityId,
  enrollmentId,
  name,
  imageCount = 0,
  onClose,
}: Props) {
  const sessionScope = useAuthStore((state) => state.user?.id || "anonymous");
  const contentRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: [
      "merchant",
      "enrollment",
      activityId,
      "questionnaire",
      sessionScope,
      enrollmentId,
    ],
    queryFn: ({ signal }) =>
      getEnrollmentQuestionnaire(activityId, enrollmentId, signal),
    enabled: sessionScope !== "anonymous",
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  useEffect(() => {
    const dialog = contentRef.current?.closest<HTMLElement>('[role="dialog"]');
    const previousFocus = document.activeElement;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
        ),
      );
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  const data = query.data;
  const current = data?.fields.filter((field) => !field.historical) || [];
  const historical = data?.fields.filter((field) => field.historical) || [];
  const renderFields = (fields: QuestionnaireField[]) => (
    <dl>
      {fields.map((field) => (
        <Answer
          key={`${field.key}:${data?.answerRevision}`}
          field={field}
          activityId={activityId}
          enrollmentId={enrollmentId}
        />
      ))}
    </dl>
  );
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${name}的报名问卷`}
      placement="right"
      size="min(100vw, 520px)"
      zIndex={1100}
    >
      <div ref={contentRef} className="px-5 pb-8 pt-4">
        <div className="rounded-xl bg-gray-50 px-3 py-3 text-xs leading-5 text-gray-500">
          <p className="flex items-center gap-1.5 font-medium text-gray-700">
            <LockKeyhole size={14} />
            活动报名资料 · 仅本活动主办方可见
          </p>
          {data?.registrationTypeName && (
            <p className="mt-1 break-words">
              报名类型：{data.registrationTypeName}
            </p>
          )}
          {data?.updatedAt && (
            <p className="mt-1">
              资料更新时间：
              {new Date(data.updatedAt).toLocaleString("zh-CN", {
                hour12: false,
              })}
            </p>
          )}
          <p className="mt-1">
            展示最新提交的报名资料，不代表历史匹配时的填写内容。
          </p>
        </div>
        {query.isPending && (
          <p role="status" className="py-8 text-center text-sm text-gray-500">
            正在加载报名问卷…
          </p>
        )}
        {query.isError && (
          <div role="alert" className="py-8 text-center text-sm text-gray-500">
            <p>报名问卷加载失败</p>
            <button
              type="button"
              className="mt-2 text-primary-600"
              onClick={() => void query.refetch()}
            >
              重新加载
            </button>
          </div>
        )}
        {data && !data.fields.length && !imageCount && (
          <p className="py-8 text-center text-sm text-gray-400">
            暂无可展示的报名资料
          </p>
        )}
        {renderFields(current)}
        {historical.length > 0 && (
          <section className="mt-5">
            <h4 className="text-sm font-semibold text-gray-800">
              历史填写内容
            </h4>
            {renderFields(historical)}
          </section>
        )}
        {imageCount > 0 && (
          <div className="mt-5">
            <PrivateEnrollmentImageGallery
              activityId={activityId}
              participantId={enrollmentId}
            />
          </div>
        )}
      </div>
    </Drawer>
  );
}
