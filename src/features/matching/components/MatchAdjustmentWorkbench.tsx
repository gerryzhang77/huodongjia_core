import React, { useMemo, useState } from "react";
import { ArrowRight, Link2Off, Plus, RefreshCw, Save, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui";
import { Toast } from "@/components/ui/Toast";
import { updateParticipantMatches } from "../services/matchingApi";
import type { MatchConstraints, MatchingSchemaGroup, ParticipantMatchResult } from "../types";
import RegistrationInfoHoverCard from "./RegistrationInfoHoverCard";

type Participant = { id: string; name: string; avatar?: string; occupation?: string; registrationTypeId?: string | null; registrationTypeName?: string; formData?: Record<string, unknown>; fieldLabels?: Record<string, string> };
type Relation = { key: string; ownerId: string; targetId: string; targetIndex: number; score: number | null };
type PendingRelation = { id: string; ownerId: string; targetId: string };

const Person: React.FC<{ person?: Participant; compact?: boolean }> = ({ person, compact }) => (
  <div className="flex min-w-0 items-center gap-2.5">
    <RegistrationInfoHoverCard name={person?.name || "未知用户"} registrationTypeName={person?.registrationTypeName} formData={person?.formData} fieldLabels={person?.fieldLabels}>
      {person?.avatar ? <img src={person.avatar} alt="" className={`${compact ? "h-8 w-8" : "h-9 w-9"} shrink-0 rounded-full object-cover`} /> : <div className={`${compact ? "h-8 w-8" : "h-9 w-9"} flex shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-600`}>{person?.name?.slice(0, 1) || "?"}</div>}
    </RegistrationInfoHoverCard>
    <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{person?.name || "未知用户"}</p><p className="truncate text-xs text-gray-500">{[person?.registrationTypeName, person?.occupation].filter(Boolean).join(" · ") || "暂无补充信息"}</p></div>
  </div>
);

const toPercent = (score?: { total_score: number | null; total_score_percent?: number | null; supplementary?: boolean } | null) => {
  if (!score || score.supplementary || score.total_score === null) return null;
  const value = Number(score?.total_score_percent ?? score?.total_score);
  if (!Number.isFinite(value)) return null;
  return Math.round(value <= 1 ? value * 100 : value);
};

interface Props { activityId: string; matchResults: ParticipantMatchResult[]; participants: Participant[]; registrationSchemaGroups: MatchingSchemaGroup[]; constraints: MatchConstraints; onResultsChanged: () => Promise<void> | void }

const MatchAdjustmentWorkbench: React.FC<Props> = ({ activityId, matchResults, participants, registrationSchemaGroups, constraints, onResultsChanged }) => {
  const displayParticipants = useMemo(() => {
    const labelsByType = new Map(registrationSchemaGroups.map((group) => [String(group.id || ""), Object.fromEntries(group.fields.map((field) => [field.key, field.label]))]));
    const fallbackLabels = Object.fromEntries(registrationSchemaGroups.flatMap((group) => group.fields.map((field) => [field.key, field.label])));
    return participants.map((person) => ({ ...person, fieldLabels: labelsByType.get(String(person.registrationTypeId || "")) || fallbackLabels }));
  }, [participants, registrationSchemaGroups]);
  const participantMap = useMemo(() => new Map(displayParticipants.map((person) => [person.id, person])), [displayParticipants]);
  const resultMap = useMemo(() => new Map(matchResults.map((result) => [result.userId, result])), [matchResults]);
  const relations = useMemo<Relation[]>(() => matchResults.flatMap((result) => result.bestMatchUserIds.map((targetId, targetIndex) => ({ key: `${result.userId}:${targetIndex}:${targetId}`, ownerId: result.userId, targetId, targetIndex, score: toPercent(result.scores?.[targetIndex]) }))).sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity)), [matchResults]);

  const [relationQuery, setRelationQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [activeRelationKey, setActiveRelationKey] = useState<string | null>(null);
  const [relationEdits, setRelationEdits] = useState<Record<string, string | null>>({});
  const [pendingRelations, setPendingRelations] = useState<PendingRelation[]>([]);
  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [newTargetId, setNewTargetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeRelation = relations.find((item) => item.key === activeRelationKey);
  const visibleRelations = useMemo(() => {
    const query = relationQuery.trim().toLowerCase();
    return relations.filter((relation) => !query || [participantMap.get(relation.ownerId)?.name, participantMap.get(relation.targetId)?.name].some((name) => (name || "").toLowerCase().includes(query)));
  }, [participantMap, relationQuery, relations]);
  const visiblePeople = useMemo(() => {
    const query = personQuery.trim().toLowerCase();
    return displayParticipants.filter((person) => !query || person.name.toLowerCase().includes(query) || (person.occupation || "").toLowerCase().includes(query));
  }, [displayParticipants, personQuery]);
  const changeCount = Object.keys(relationEdits).length + pendingRelations.length;
  const replacementPeople = useMemo(() => {
    if (!activeRelation) return [];
    const query = candidateQuery.trim().toLowerCase();
    const occupied = new Set(resultMap.get(activeRelation.ownerId)?.bestMatchUserIds || []);
    occupied.delete(activeRelation.targetId);
    Object.entries(relationEdits).forEach(([key, targetId]) => {
      if (!key.startsWith(`${activeRelation.ownerId}:`) || !targetId) return;
      occupied.add(targetId);
    });
    return displayParticipants.filter((person) =>
      person.id !== activeRelation.ownerId &&
      !occupied.has(person.id) &&
      (!query || person.name.toLowerCase().includes(query) || (person.occupation || "").toLowerCase().includes(query)),
    );
  }, [activeRelation, candidateQuery, displayParticipants, relationEdits, resultMap]);

  const setEdit = (relation: Relation, targetId: string | null) => {
    setRelationEdits((current) => targetId === relation.targetId ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== relation.key)) : { ...current, [relation.key]: targetId });
    setActiveRelationKey(null);
  };

  const addPendingRelation = () => {
    if (!newOwnerId || !newTargetId) return;
    const existing = resultMap.get(newOwnerId)?.bestMatchUserIds || [];
    const removedCount = relations.filter((relation) => relation.ownerId === newOwnerId && Object.prototype.hasOwnProperty.call(relationEdits, relation.key) && relationEdits[relation.key] === null).length;
    const addedCount = pendingRelations.filter((relation) => relation.ownerId === newOwnerId).length;
    if (existing.length - removedCount + addedCount >= constraints.maxMatches) { Toast.show({ icon: "fail", content: `该成员最多保留 ${constraints.maxMatches} 条匹配关系` }); return; }
    const effectiveTargets = new Set(existing.map((targetId, index) => relationEdits[`${newOwnerId}:${index}:${targetId}`] ?? targetId).filter(Boolean));
    pendingRelations.filter((item) => item.ownerId === newOwnerId).forEach((item) => effectiveTargets.add(item.targetId));
    if (effectiveTargets.has(newTargetId)) { Toast.show({ icon: "fail", content: "这条匹配关系已存在" }); return; }
    setPendingRelations((current) => [...current, { id: `${newOwnerId}:${newTargetId}:${Date.now()}`, ownerId: newOwnerId, targetId: newTargetId }]);
    setNewTargetId(null);
  };

  const saveAll = async () => {
    const affectedOwners = new Set<string>();
    relations.forEach((relation) => { if (Object.prototype.hasOwnProperty.call(relationEdits, relation.key)) affectedOwners.add(relation.ownerId); });
    pendingRelations.forEach((relation) => affectedOwners.add(relation.ownerId));
    setSaving(true);
    try {
      await Promise.all(Array.from(affectedOwners).map(async (ownerId) => {
        const ids = [...(resultMap.get(ownerId)?.bestMatchUserIds || [])];
        relations.filter((relation) => relation.ownerId === ownerId && Object.prototype.hasOwnProperty.call(relationEdits, relation.key)).sort((a, b) => b.targetIndex - a.targetIndex).forEach((relation) => {
          const targetId = relationEdits[relation.key];
          if (targetId === null) ids.splice(relation.targetIndex, 1); else ids[relation.targetIndex] = targetId;
        });
        pendingRelations.filter((relation) => relation.ownerId === ownerId).forEach((relation) => { if (!ids.includes(relation.targetId)) ids.push(relation.targetId); });
        await updateParticipantMatches(activityId, ownerId, ids, {
          allowOverride: true,
          reason: "商家在匹配草稿工作台中人工调整",
        });
      }));
      await onResultsChanged();
      setRelationEdits({}); setPendingRelations([]); setActiveRelationKey(null);
      Toast.show({ icon: "success", content: "全部调整已保存并应用" });
    } catch (error) { Toast.show({ icon: "fail", content: error instanceof Error ? error.message : "保存调整失败" }); }
    finally { setSaving(false); }
  };

  return <section className="mb-4 overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-sm">
    <header className="border-b border-gray-100 bg-gradient-to-r from-primary-50 to-white px-5 py-4"><div className="flex items-center gap-2"><Users size={18} className="text-primary-600" /><h3 className="font-semibold text-gray-900">匹配调整工作台</h3></div><p className="mt-1 text-xs text-gray-500">拆散、换人和新增关系会暂存在本页，确认后在页面底部统一保存应用。</p></header>

    <div className="grid border-b border-gray-100 lg:grid-cols-2">
      <div className="border-b border-gray-100 p-4 lg:border-b-0 lg:border-r"><div className="mb-3 flex items-center justify-between"><div><h4 className="text-sm font-semibold text-gray-900">现有匹配关系</h4><p className="mt-1 text-xs text-gray-500">按匹配度从低到高</p></div><span className="text-xs text-gray-400">{visibleRelations.length} 条</span></div><label className="relative mb-3 block"><Search size={14} className="absolute left-3 top-2.5 text-gray-400" /><input value={relationQuery} onChange={(event) => setRelationQuery(event.target.value)} placeholder="搜索关系中的成员" className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-sm" /></label><div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">{visibleRelations.map((relation) => { const edited = Object.prototype.hasOwnProperty.call(relationEdits, relation.key); const targetId = edited ? relationEdits[relation.key] : relation.targetId; return <div key={relation.key} className={`rounded-xl border p-3 ${targetId === null ? "border-red-200 bg-red-50 opacity-70" : edited ? "border-primary-200 bg-primary-50" : "border-gray-200"}`}><div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3"><Person person={participantMap.get(relation.ownerId)} compact /><ArrowRight size={15} className="shrink-0 text-gray-300" />{targetId ? <Person person={participantMap.get(targetId)} compact /> : <div className="text-sm font-medium text-red-600">待拆散</div>}</div><div className="mt-3 flex items-center justify-between border-t border-gray-200/70 pt-2.5"><span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs text-gray-600">匹配度 {relation.score == null ? "—" : `${relation.score}%`}</span><div className="flex items-center gap-2"><button onClick={() => { setActiveRelationKey(relation.key); setCandidateQuery(""); }} className="shrink-0 rounded-lg border border-primary-200 px-2 py-1.5 text-xs text-primary-600"><RefreshCw size={12} className="mr-1 inline" />换人</button><button onClick={() => setEdit(relation, null)} className="shrink-0 rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-600"><Link2Off size={12} className="mr-1 inline" />拆散</button></div></div></div>; })}</div></div>
      <div className="p-4"><div className="mb-3"><h4 className="text-sm font-semibold text-gray-900">更换匹配对象</h4><p className="mt-1 text-xs text-gray-500">{activeRelation ? `为 ${participantMap.get(activeRelation.ownerId)?.name || "该成员"} 选择新的匹配对象` : "点击左侧某条关系的“换人”开始选择"}</p></div>{activeRelation && <label className="relative mb-3 block"><Search size={14} className="absolute left-3 top-2.5 text-gray-400" /><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="从活动参与者中搜索" className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-sm" /></label>}<div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">{activeRelation ? replacementPeople.map((person) => <div key={person.id} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"><div className="min-w-0 flex-1"><Person person={person} compact /></div><button onClick={() => setEdit(activeRelation, person.id)} className="shrink-0 rounded-lg border border-primary-200 px-2.5 py-1.5 text-xs text-primary-600">换为此人</button></div>) : <div className="rounded-xl border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">尚未选择需要更换的关系</div>}</div></div>
    </div>

    <div className="border-b border-gray-100 p-5"><div className="mb-4"><h4 className="text-sm font-semibold text-gray-900">新增匹配关系</h4><p className="mt-1 text-xs text-gray-500">先从所有人中指定 A 和 B，再加入右侧的新增关系池。</p></div><div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-gray-200"><div className="border-b border-gray-100 p-3"><div className="mb-2 flex items-center justify-between text-xs"><span className="text-gray-500">A：{newOwnerId ? participantMap.get(newOwnerId)?.name : "未选择"}</span><span className="text-gray-500">B：{newTargetId ? participantMap.get(newTargetId)?.name : "未选择"}</span></div><label className="relative block"><Search size={14} className="absolute left-3 top-2.5 text-gray-400" /><input value={personQuery} onChange={(event) => setPersonQuery(event.target.value)} placeholder="搜索所有参与者" className="h-9 w-full rounded-lg border border-gray-200 pl-8 pr-3 text-sm" /></label></div><div className="max-h-[360px] space-y-1 overflow-y-auto p-2">{visiblePeople.map((person) => { const canBeTarget = Boolean(newOwnerId && person.id !== newOwnerId); return <div key={person.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-50"><div className="min-w-0 flex-1"><Person person={person} compact /></div><button onClick={() => { setNewOwnerId(person.id); if (newTargetId === person.id) setNewTargetId(null); }} className={`rounded-lg border px-2 py-1 text-xs ${newOwnerId === person.id ? "border-primary-400 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-600"}`}>选为 A</button><button disabled={!canBeTarget} onClick={() => setNewTargetId(person.id)} className={`rounded-lg border px-2 py-1 text-xs disabled:text-gray-300 ${newTargetId === person.id ? "border-primary-400 bg-primary-50 text-primary-700" : "border-gray-200 text-gray-600"}`}>选为 B</button></div>; })}</div></div><div className="rounded-xl border border-gray-200"><div className="flex items-center justify-between border-b border-gray-100 p-3"><div><h5 className="text-sm font-medium text-gray-900">新增关系池</h5><p className="mt-0.5 text-xs text-gray-500">{pendingRelations.length} 条待新增</p></div><Button size="small" disabled={!newOwnerId || !newTargetId} icon={<Plus size={14} />} onClick={addPendingRelation}>加入关系池</Button></div><div className="max-h-[360px] space-y-2 overflow-y-auto p-3">{pendingRelations.length ? pendingRelations.map((relation) => <div key={relation.id} className="flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50 p-3"><div className="min-w-0 flex-1"><Person person={participantMap.get(relation.ownerId)} compact /></div><ArrowRight size={15} className="shrink-0 text-primary-400" /><div className="min-w-0 flex-1"><Person person={participantMap.get(relation.targetId)} compact /></div><button onClick={() => setPendingRelations((current) => current.filter((item) => item.id !== relation.id))} className="shrink-0 p-1 text-red-500"><Trash2 size={15} /></button></div>) : <div className="py-16 text-center text-sm text-gray-400">暂无待新增关系</div>}</div></div></div></div>

    <footer className="flex flex-col gap-3 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">共有 <span className="font-semibold text-primary-600">{changeCount}</span> 项未应用调整</p><Button icon={<Save size={17} />} loading={saving} disabled={changeCount === 0} onClick={() => void saveAll()}>保存并应用全部调整</Button></footer>
  </section>;
};

export default MatchAdjustmentWorkbench;
