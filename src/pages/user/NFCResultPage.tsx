import { FC, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Lock,
  LogIn,
  Link as LinkIcon,
  Radio,
  RefreshCw,
  Settings,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { getCurrentUser } from "@/features/auth/services";
import { Toast } from "@/components/ui/Toast";
import { api } from "@/services/api";
import {
  bindNfcTag,
  getNfcDisplayEnrollments,
  resolveNfcTag,
  updateNfcDisplayConfig,
  type NfcDisplayEnrollmentOption,
  type NfcResolveData,
} from "@/services/nfcApi";
import { updateUserProfile, type UserProfile } from "@/services/userApi";
import { PublicProfileCard } from "@/features/user/profile";
import { useImageUpload, type UploadHandle } from "@/features/uploads";
import type { User } from "@/features/auth/types";

interface LegacyNfcData {
  otherUserInfo: UserProfile;
  otherEnrollmentInfo: Record<string, unknown>;
}

const MAX_NFC_PHOTOS = 9;

function getErrorMessage(error: unknown, fallback: string): string {
  const maybeAxios = error as { response?: { data?: { message?: string } }; message?: string };
  return maybeAxios?.response?.data?.message || maybeAxios?.message || fallback;
}

function normalizePhotos(photos?: string[] | null): string[] {
  return (photos || [])
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .slice(0, MAX_NFC_PHOTOS);
}

function buildRedirect(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search}`;
}

function buildNfcEditPath(userType: User["user_type"] | undefined, redirect: string) {
  const encodedRedirect = encodeURIComponent(redirect);
  if (userType === "user") return `/u/profile/edit?redirect=${encodedRedirect}`;
  if (userType === "organizer" || userType === "admin") {
    return `/dashboard/profile/edit?redirect=${encodedRedirect}`;
  }
  return "";
}

function getNfcHomePath(userType: User["user_type"] | undefined) {
  if (userType === "organizer" || userType === "admin") return "/dashboard";
  return "/u/home";
}

const PageShell: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
    <div className="mx-auto min-h-screen max-w-lg bg-white dark:bg-gray-800 shadow-sm">
      {children}
    </div>
  </div>
);

const Header: FC<{ title: string; subtitle?: string; onBack: () => void }> = ({
  title,
  subtitle,
  onBack,
}) => (
  <div className="relative bg-gradient-to-br from-primary-500 to-accent-500 px-4 pb-16 pt-12 text-white">
    <button
      type="button"
      onClick={onBack}
      className="absolute left-4 top-4 rounded-full bg-white/20 p-2 transition-colors hover:bg-white/30"
      aria-label="返回"
    >
      <ArrowLeft size={20} />
    </button>
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
        <Radio size={24} />
      </div>
      <div>
        <h1 className="text-lg font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-xs text-white/75">{subtitle}</p>}
      </div>
    </div>
  </div>
);

const CompactHeader: FC<{ title: string; onBack: () => void; label?: string }> = ({
  title,
  onBack,
  label,
}) => (
  <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
    <div className="flex h-9 items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        aria-label="返回"
      >
        <ArrowLeft size={18} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Radio size={16} className="flex-shrink-0 text-primary-500" />
          <h1 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
        </div>
      </div>
      {label && (
              <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-500 dark:bg-primary-900/25 dark:text-primary-300">
          {label}
        </span>
      )}
    </div>
  </div>
);

const StatusPanel: FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  actionLabel?: string;
  actionIcon?: React.ElementType;
  actionLoading?: boolean;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionIcon: ActionIcon,
  actionLoading,
  onAction,
  secondaryLabel,
  onSecondary,
}) => (
  <div className="mx-4 -mt-10 rounded-2xl bg-white p-5 shadow-lg dark:bg-gray-800">
    <div className="flex flex-col items-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 dark:bg-primary-900/30">
        <Icon size={28} />
      </div>
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          disabled={actionLoading}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {actionLoading ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : ActionIcon ? (
            <ActionIcon size={16} />
          ) : null}
          <span>{actionLabel}</span>
        </button>
      )}
      {secondaryLabel && onSecondary && (
        <button
          type="button"
          onClick={onSecondary}
          className="mt-3 text-sm font-medium text-primary-500"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  </div>
);

const EnrollmentOptionPicker: FC<{
  options: NfcDisplayEnrollmentOption[];
  selectedEventId: string;
  loading?: boolean;
  saving?: boolean;
  actionLabel: string;
  emptyText: string;
  variant?: "card" | "drawer";
  open?: boolean;
  onSelect: (eventId: string) => void;
  onSubmit: () => void;
  onClose?: () => void;
}> = ({
  options,
  selectedEventId,
  loading,
  saving,
  actionLabel,
  emptyText,
  variant = "card",
  open = true,
  onSelect,
  onSubmit,
  onClose,
}) => {
  const selectedOption = options.find((option) => option.eventId === selectedEventId);
  const content = (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
            选择展示的报名表
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            碰一碰时会优先展示这份活动报名信息。
          </p>
        </div>
        {variant === "drawer" && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <RefreshCw size={16} className="animate-spin" />
          正在加载报名表
        </div>
      ) : options.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400 dark:border-gray-700">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((option) => {
            const selected = option.eventId === selectedEventId;
            return (
              <button
                key={option.participantId}
                type="button"
                onClick={() => onSelect(option.eventId)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                  selected
                    ? "border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20"
                    : "border-gray-100 bg-white hover:border-primary-200 dark:border-gray-700 dark:bg-gray-800"
                }`}
              >
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {[option.eventTitle, option.registrationTypeName].filter(Boolean).join(" · ")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selectedOption && (
        <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500 dark:bg-gray-700/40 dark:text-gray-300">
          当前选择：
          {[selectedOption.eventTitle, selectedOption.registrationTypeName]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!selectedEventId || loading || saving || options.length === 0}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Settings size={16} />}
        <span>{saving ? "正在保存" : actionLabel}</span>
      </button>
    </>
  );

  if (variant === "drawer") {
    return (
      <div
        className={`fixed inset-0 z-50 transition-opacity ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/35"
          aria-label="关闭报名表选择"
          onClick={onClose}
        />
        <aside
          className={`absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl transition-transform duration-300 dark:bg-gray-800 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex-1 overflow-y-auto p-4 pt-6">{content}</div>
        </aside>
      </div>
    );
  }

  return (
    <div className="mx-4 -mt-10 rounded-2xl bg-white p-4 shadow-lg dark:bg-gray-800">
      {content}
    </div>
  );
};

const NfcProfileCard: FC<{
  profile: UserProfile;
  isSelf: boolean;
  authenticated: boolean;
  canEdit: boolean;
  contextLabel?: string;
  className?: string;
  onLogin: () => void;
  onEdit: () => void;
  onProfilePatched?: (patch: Partial<UserProfile>) => void;
}> = ({
  profile,
  isSelf,
  authenticated,
  canEdit,
  contextLabel,
  className,
  onLogin,
  onEdit,
  onProfilePatched,
}) => {
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoUpload = useImageUpload({ kind: "photo" });
  const [localPhotos, setLocalPhotos] = useState<string[] | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);

  const profilePhotoKey = normalizePhotos(profile.photos).join("\u0000");
  const displayPhotos = localPhotos ?? normalizePhotos(profile.photos);
  const effectiveProfile = localPhotos ? { ...profile, photos: localPhotos } : profile;

  useEffect(() => {
    setLocalPhotos(null);
  }, [profile.id, profilePhotoKey]);

  const openPhotoPicker = () => {
    if (!canEdit) {
      if (!authenticated) {
        onLogin();
        return;
      }
      Toast.show({ icon: "fail", content: "请使用绑定账号编辑卡片" });
      return;
    }

    if (photoSaving) return;

    if (displayPhotos.length >= MAX_NFC_PHOTOS) {
      Toast.show({ icon: "fail", content: `照片墙最多 ${MAX_NFC_PHOTOS} 张` });
      return;
    }

    if (photoInputRef.current) photoInputRef.current.value = "";
    photoInputRef.current?.click();
  };

  const persistPhotos = async (
    nextPhotos: string[],
    rollbackPhotos: string[],
    successMessage: string,
  ) => {
    const normalizedNextPhotos = normalizePhotos(nextPhotos);
    setLocalPhotos(normalizedNextPhotos);

    try {
      const response = await updateUserProfile({ photos: normalizedNextPhotos });
      const savedPhotos = normalizePhotos(response.profile?.photos || normalizedNextPhotos);

      setLocalPhotos(savedPhotos);
      onProfilePatched?.({ photos: savedPhotos });
      queryClient.setQueryData<{ success?: boolean; profile?: UserProfile }>(
        ["user", "profile"],
        (old) =>
          old?.profile
            ? { ...old, profile: { ...old.profile, photos: savedPhotos } }
            : old,
      );
      queryClient.invalidateQueries({ queryKey: ["user", "profile"] });
      queryClient.invalidateQueries({ queryKey: ["publicProfile", profile.id] });
      queryClient.invalidateQueries({ queryKey: ["nfc"] });
      Toast.show({ icon: "success", content: successMessage });
    } catch (error) {
      setLocalPhotos(rollbackPhotos);
      Toast.show({
        icon: "fail",
        content: getErrorMessage(error, "照片保存失败，请重试"),
      });
    }
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const existingPhotos = displayPhotos.filter((url) => !url.startsWith("blob:"));
    const remainingSlots = MAX_NFC_PHOTOS - existingPhotos.length;
    const selectedFiles = files.slice(0, remainingSlots);

    if (files.length > remainingSlots) {
      Toast.show({ icon: "fail", content: `照片墙最多 ${MAX_NFC_PHOTOS} 张` });
    }

    const handles = selectedFiles
      .map((file) => {
        const handle = photoUpload.uploadWithPreview(file);
        if (!handle.tempUrl) {
          handle.finalUrlPromise.catch(() => undefined);
          return null;
        }
        return handle;
      })
      .filter((handle): handle is UploadHandle => Boolean(handle));

    if (!handles.length) {
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }

    const tempUrls = handles.map((handle) => handle.tempUrl);
    setLocalPhotos([...existingPhotos, ...tempUrls]);
    setPhotoSaving(true);

    const uploads = handles.map((handle) =>
      handle.finalUrlPromise.then((realUrl) => {
        setLocalPhotos((prev) =>
          prev?.map((url) => (url === handle.tempUrl ? realUrl : url)) ?? null,
        );
        return realUrl;
      }),
    );

    Promise.allSettled(uploads)
      .then(async (results) => {
        const uploadedPhotos = results
          .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled")
          .map((result) => result.value);
        const nextPhotos = normalizePhotos([...existingPhotos, ...uploadedPhotos]);

        if (!uploadedPhotos.length) {
          setLocalPhotos(existingPhotos);
          return;
        }

        await persistPhotos(nextPhotos, existingPhotos, "照片已添加");
      })
      .catch((error) => {
        setLocalPhotos(existingPhotos);
        Toast.show({
          icon: "fail",
          content: getErrorMessage(error, "照片保存失败，请重试"),
        });
      })
      .finally(() => {
        setPhotoSaving(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
      });
  };

  const handleRemovePhoto = (index: number) => {
    if (!canEdit || photoSaving) return;

    const existingPhotos = normalizePhotos(displayPhotos.filter((url) => !url.startsWith("blob:")));
    if (index < 0 || index >= existingPhotos.length) return;

    const nextPhotos = existingPhotos.filter((_, photoIndex) => photoIndex !== index);
    setPhotoSaving(true);
    void persistPhotos(nextPhotos, existingPhotos, "照片已删除").finally(() => {
      setPhotoSaving(false);
    });
  };

  return (
    <>
      <PublicProfileCard
        profile={effectiveProfile}
        variant="nfc"
        isSelf={isSelf}
        authenticated={authenticated}
        contextLabel={contextLabel}
        className={className}
        onLogin={onLogin}
        onEdit={canEdit ? onEdit : undefined}
        onAddPhotos={canEdit ? openPhotoPicker : undefined}
        onRemovePhoto={canEdit ? handleRemovePhoto : undefined}
        photoActionLoading={photoSaving}
        photoActionDisabled={photoSaving}
        avatarOverlap={false}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handlePhotoChange}
      />
    </>
  );
};

const TokenNfcPage: FC<{ token: string }> = ({ token }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const {
    user: currentUser,
    token: authToken,
    setAuth,
  } = useAuthStore();
  const [selectedDisplayEventId, setSelectedDisplayEventId] = useState("");
  const [showDisplayConfig, setShowDisplayConfig] = useState(false);

  const query = useQuery({
    queryKey: ["nfc", "tag", token],
    queryFn: () => resolveNfcTag(token),
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });

  const bindMutation = useMutation({
    mutationFn: () => bindNfcTag(token, selectedDisplayEventId || undefined),
    onSuccess: (data) => {
      queryClient.setQueryData<NfcResolveData>(["nfc", "tag", token], data);
      setSelectedDisplayEventId(data.tag.displayConfig?.eventId || selectedDisplayEventId);
      Toast.show({ icon: "success", content: "手环绑定成功" });
    },
    onError: (error) => {
      Toast.show({
        icon: "fail",
        content: getErrorMessage(error, "绑定失败，请稍后重试"),
      });
      queryClient.invalidateQueries({ queryKey: ["nfc", "tag", token] });
    },
  });

  const enrollmentOptionsQuery = useQuery({
    queryKey: ["nfc", "tag", token, "enrollments"],
    queryFn: () => getNfcDisplayEnrollments(token),
    enabled: Boolean(currentUser),
    staleTime: 30 * 1000,
  });

  const configMutation = useMutation({
    mutationFn: () => updateNfcDisplayConfig(token, selectedDisplayEventId),
    onSuccess: (data) => {
      queryClient.setQueryData<NfcResolveData>(["nfc", "tag", token], data);
      setSelectedDisplayEventId(data.tag.displayConfig?.eventId || selectedDisplayEventId);
      setShowDisplayConfig(false);
      Toast.show({ icon: "success", content: "展示内容已更新" });
    },
    onError: (error) => {
      Toast.show({
        icon: "fail",
        content: getErrorMessage(error, "更新失败，请稍后重试"),
      });
    },
  });

  useEffect(() => {
    const options = enrollmentOptionsQuery.data?.options || [];
    if (selectedDisplayEventId || options.length === 0) return;
    const selected = options.find((option) => option.selected);
    setSelectedDisplayEventId(selected?.eventId || options[0].eventId);
  }, [enrollmentOptionsQuery.data?.options, selectedDisplayEventId]);

  const redirect = buildRedirect(location);
  const goLogin = () => navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
  const goRegister = () => navigate(`/register?redirect=${encodeURIComponent(redirect)}`);
  const goBack = () => navigate(getNfcHomePath(currentUser?.user_type), { replace: true });
  const goEdit = async () => {
    const currentEditPath = buildNfcEditPath(currentUser?.user_type, redirect);
    if (currentEditPath) {
      navigate(currentEditPath);
      return;
    }

    if (!authToken) {
      goLogin();
      return;
    }

    const response = await getCurrentUser();
    if (response.success && response.user) {
      setAuth(response.user, authToken);
      const refreshedEditPath = buildNfcEditPath(response.user.user_type, redirect);
      if (refreshedEditPath) {
        navigate(refreshedEditPath);
        return;
      }
    }

    Toast.show({ icon: "fail", content: "当前账号类型暂不支持编辑名片" });
  };

  const handleBind = () => {
    if (!currentUser) {
      goLogin();
      return;
    }
    if (!selectedDisplayEventId) {
      Toast.show({ icon: "fail", content: "请选择要展示的报名表" });
      return;
    }
    bindMutation.mutate();
  };

  if (query.isLoading) {
    return (
      <PageShell>
        <Header title="NFC 手环" subtitle="正在读取手环信息" onBack={goBack} />
        <StatusPanel
          icon={Radio}
          title="正在读取"
          description="正在识别这只 NFC 手环，请稍候。"
        />
      </PageShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <PageShell>
        <Header title="NFC 手环" subtitle="读取失败" onBack={goBack} />
        <StatusPanel
          icon={ShieldAlert}
          title="无法识别手环"
          description={getErrorMessage(query.error, "这只手环不存在、未激活或链接已失效。")}
          actionLabel="重新读取"
          actionIcon={RefreshCw}
          onAction={() => query.refetch()}
        />
      </PageShell>
    );
  }

  const data = query.data;
  const status = data.status;
  const profile = data.profile;
  const isSelf = data.viewer.isSelf;
  const authenticated = data.viewer.isAuthenticated || !!currentUser;
  const canEditCard = isSelf && authenticated;
  const enrollmentOptions = enrollmentOptionsQuery.data?.options || [];

  if (status === "unbound") {
    return (
      <PageShell>
        <Header title="NFC 手环" subtitle="首次绑定" onBack={goBack} />
        {authenticated ? (
          <EnrollmentOptionPicker
            options={enrollmentOptions}
            selectedEventId={selectedDisplayEventId}
            loading={enrollmentOptionsQuery.isLoading}
            saving={bindMutation.isPending}
            actionLabel="绑定并展示这份报名表"
            emptyText="当前账号还没有可展示的报名表，请先完成活动报名。"
            onSelect={setSelectedDisplayEventId}
            onSubmit={handleBind}
          />
        ) : (
          <StatusPanel
            icon={LinkIcon}
            title="这是一只未绑定的手环"
            description="登录或注册后即可把这只手环绑定到你的账号，并选择要展示的活动报名表。"
            actionLabel="登录后绑定"
            actionIcon={LogIn}
            actionLoading={bindMutation.isPending}
            onAction={handleBind}
            secondaryLabel="还没有账号，去注册"
            onSecondary={goRegister}
          />
        )}
      </PageShell>
    );
  }

  if (status === "disabled" || status === "lost") {
    return (
      <PageShell>
        <Header title="NFC 手环" subtitle="不可用" onBack={goBack} />
        <StatusPanel
          icon={Lock}
          title={status === "lost" ? "手环已挂失" : "手环已停用"}
          description="这只 NFC 手环当前不可使用。如需恢复，请联系活动方或平台管理员。"
        />
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell>
        <Header title="NFC 手环" subtitle="资料不可用" onBack={goBack} />
        <StatusPanel
          icon={AlertCircle}
          title="暂时无法展示卡片"
          description="手环已绑定，但对应用户资料暂时不可用。"
          actionLabel="重新读取"
          actionIcon={RefreshCw}
          onAction={() => query.refetch()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <CompactHeader
        title={isSelf ? "我的手环名片" : "NFC 名片"}
        onBack={goBack}
      />
      {isSelf && (
        <div className="mx-4 pt-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-400">当前展示</p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {data.tag.displayConfig?.eventTitle ||
                    profile.nfcDisplay?.eventTitle ||
                    "默认报名资料"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDisplayConfig(true)}
                className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full bg-primary-50 px-3 text-xs font-semibold text-primary-600 dark:bg-primary-900/25 dark:text-primary-300"
              >
                <Settings size={14} />
                更换
              </button>
            </div>
          </div>
        </div>
      )}
      {isSelf && (
        <EnrollmentOptionPicker
          variant="drawer"
          open={showDisplayConfig}
          options={enrollmentOptions}
          selectedEventId={selectedDisplayEventId}
          loading={enrollmentOptionsQuery.isLoading}
          saving={configMutation.isPending}
          actionLabel="保存展示内容"
          emptyText="当前账号还没有可切换的报名表。"
          onSelect={setSelectedDisplayEventId}
          onSubmit={() => configMutation.mutate()}
          onClose={() => setShowDisplayConfig(false)}
        />
      )}
      <NfcProfileCard
        profile={profile}
        isSelf={isSelf}
        authenticated={authenticated}
        canEdit={canEditCard}
        contextLabel={isSelf ? "我的手环" : undefined}
        className="mx-4 py-4"
        onLogin={goLogin}
        onEdit={() => void goEdit()}
        onProfilePatched={(patch) => {
          queryClient.setQueryData<NfcResolveData>(["nfc", "tag", token], (old) =>
            old?.profile ? { ...old, profile: { ...old.profile, ...patch } } : old,
          );
          queryClient.invalidateQueries({ queryKey: ["nfc", "tag", token] });
        }}
      />
    </PageShell>
  );
};

const LegacyNfcPage: FC<{ eventId: string; userId: string }> = ({ eventId, userId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    user: currentUser,
    token: authToken,
    setAuth,
  } = useAuthStore();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["nfc", "legacy", eventId, userId],
    queryFn: () =>
      api.get<{ success: boolean; data: LegacyNfcData }>(`/api/nfc/${eventId}/${userId}`),
    enabled: !!eventId && !!userId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const profile = data?.data?.otherUserInfo;
  const goBack = () => navigate(getNfcHomePath(currentUser?.user_type), { replace: true });
  const redirect = `/nfc/${eventId}/${userId}`;
  const isSelf = !!currentUser && currentUser.id === profile?.id;
  const canEditCard = isSelf;
  const goEdit = async () => {
    const currentEditPath = buildNfcEditPath(currentUser?.user_type, redirect);
    if (currentEditPath) {
      navigate(currentEditPath);
      return;
    }

    if (!authToken) {
      navigate(`/login?redirect=${encodeURIComponent(redirect)}`);
      return;
    }

    const response = await getCurrentUser();
    if (response.success && response.user) {
      setAuth(response.user, authToken);
      const refreshedEditPath = buildNfcEditPath(response.user.user_type, redirect);
      if (refreshedEditPath) {
        navigate(refreshedEditPath);
        return;
      }
    }

    Toast.show({ icon: "fail", content: "当前账号类型暂不支持编辑名片" });
  };

  if (isLoading) {
    return (
      <PageShell>
        <Header title="NFC 碰一碰" subtitle="正在获取信息" onBack={goBack} />
        <StatusPanel icon={Zap} title="正在读取" description="正在获取对方的活动名片。" />
      </PageShell>
    );
  }

  if (isError || !profile) {
    return (
      <PageShell>
        <Header title="NFC 碰一碰" subtitle="读取失败" onBack={goBack} />
        <StatusPanel
          icon={AlertCircle}
          title="获取信息失败"
          description={getErrorMessage(error, "请确认活动和用户信息是否正确。")}
          actionLabel="返回"
          onAction={goBack}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <CompactHeader
        title={isSelf ? "我的手环名片" : "NFC 名片"}
        label="旧版链接"
        onBack={goBack}
      />
      <NfcProfileCard
        profile={profile}
        isSelf={isSelf}
        authenticated={!!currentUser}
        canEdit={canEditCard}
        contextLabel={isSelf ? "我的手环" : undefined}
        className="mx-4 py-4"
        onLogin={() => navigate(`/login?redirect=${encodeURIComponent(redirect)}`)}
        onEdit={() => void goEdit()}
        onProfilePatched={(patch) => {
          queryClient.setQueryData<{ success: boolean; data: LegacyNfcData }>(
            ["nfc", "legacy", eventId, userId],
            (old) =>
              old?.data?.otherUserInfo
                ? {
                    ...old,
                    data: {
                      ...old.data,
                      otherUserInfo: { ...old.data.otherUserInfo, ...patch },
                    },
                  }
                : old,
          );
          queryClient.invalidateQueries({ queryKey: ["nfc", "legacy", eventId, userId] });
        }}
      />
      <div className="px-4 pb-8 pt-4 text-center text-xs text-gray-400">
        活动 ID: {eventId}
      </div>
    </PageShell>
  );
};

const NFCResultPage: FC = () => {
  const { token, eventId, userId } = useParams<{
    token?: string;
    eventId?: string;
    userId?: string;
  }>();

  if (token) return <TokenNfcPage token={token} />;
  if (eventId && userId) return <LegacyNfcPage eventId={eventId} userId={userId} />;

  return (
    <PageShell>
      <Header title="NFC 手环" subtitle="参数错误" onBack={() => window.history.back()} />
      <StatusPanel icon={AlertCircle} title="链接无效" description="请确认 NFC 手环链接是否完整。" />
    </PageShell>
  );
};

export default NFCResultPage;
