import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import type { MatchPreflightResult, Participant } from "../types";

interface Props {
  result: MatchPreflightResult | null;
  participants: Participant[];
  selectedIds: string[];
  checking: boolean;
  error?: string | null;
  disabled?: boolean;
  onSelection: (ids: string[], selected: boolean) => void;
}

export default function MatchingAvailability({ result, participants, selectedIds, checking, error, disabled, onSelection }: Props) {
  const [expanded, setExpanded] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const people = useMemo(() => new Map(participants.map(p => [p.id, p])), [participants]);
  const excluded = participants.filter(p => !selected.has(p.id));
  const shortages = (result?.hardRuleDiagnostics || []).filter(p => p.availableCandidates === 0 || !p.canMeetMinimum);
  const emptyIds = shortages.filter(p => p.availableCandidates === 0).map(p => p.userId);
  const shortCount = shortages.length - emptyIds.length;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700">
          {checking ? "正在检查推荐人数…" : error ? error : !result ? "设置完成后自动检查推荐人数" : shortages.length > 0
            ? `${emptyIds.length ? `${emptyIds.length} 人暂无推荐` : ""}${emptyIds.length && shortCount ? "，" : ""}${shortCount ? `${shortCount} 人推荐不足` : ""}。${result.canExecute ? "不影响其他人匹配。" : result.message}`
            : result.canExecute ? `${selectedIds.length} 人可参与匹配` : result.message}
          {excluded.length > 0 && <span className="ml-2 text-gray-500">本次已排除 {excluded.length} 人</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {(shortages.length > 0 || excluded.length > 0) && <Button size="small" variant="outline" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? "收起名单" : "查看名单"}</Button>}
          {emptyIds.length > 0 && <Button size="small" variant="outline" disabled={disabled || checking} onClick={() => { onSelection(emptyIds, false); setExpanded(true); }}>排除这 {emptyIds.length} 人</Button>}
        </div>
      </div>
      {expanded && <div className="mt-3 divide-y divide-gray-100">
        {shortages.map(item => {
          const person = people.get(item.userId);
          return <div key={item.userId} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0"><p className="text-sm font-medium text-gray-900">{person?.name || item.userId.slice(0, 8)} <span className="font-normal text-gray-500">{person?.registrationTypeName}</span></p>
              <p className="mt-1 text-xs text-gray-600">可推荐 {item.availableCandidates} 人{item.requiredCandidates > 0 ? `，目标至少 ${item.requiredCandidates} 人` : ""} · {item.reason || "符合当前条件的推荐对象不足"}</p></div>
            <Button size="small" variant="outline" disabled={disabled || checking} onClick={() => onSelection([item.userId], false)}>本次排除</Button>
          </div>;
        })}
        {excluded.map(person => <div key={person.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm text-gray-700">{person.name}</p><p className="text-xs text-gray-500">已排除 · 仅对本次匹配生效</p></div><Button size="small" variant="outline" disabled={disabled || checking} onClick={() => onSelection([person.id], true)}>恢复参与</Button></div>)}
      </div>}
    </div>
  );
}
