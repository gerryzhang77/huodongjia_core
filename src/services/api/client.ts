/**
 * API 客户端配置
 *
 * 简化版：
 * - 开发环境使用 MSW (Mock Service Worker) 拦截请求
 * - 生产环境直接请求真实后端 API
 *
 * MSW 工作原理：
 * - MSW 在浏览器的 Service Worker 层拦截网络请求
 * - 无需修改 axios 的 baseURL，MSW 自动拦截匹配的请求
 * - 请求路径保持一致，如 /api/auth/login
 */
import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { queryClient } from "@/config/queryClient";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { clearProtectedImageObjectUrlCache } from "@/services/protectedImageCache";

// ========================================
// 自定义 API 响应类型
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface CustomAxiosInstance
  extends Omit<AxiosInstance, "get" | "post" | "put" | "delete" | "patch"> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get<T = any>(url: string, config?: any): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post<T = any>(url: string, data?: any, config?: any): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put<T = any>(url: string, data?: any, config?: any): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete<T = any>(url: string, config?: any): Promise<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patch<T = any>(url: string, data?: any, config?: any): Promise<T>;
}

// ========================================
// 获取 API 基础 URL
// ========================================
function getApiBaseURL(): string {
  const useMock = import.meta.env.VITE_USE_MOCK;

  // MSW Mock 模式：使用空字符串（MSW 拦截相对路径请求）
  if (useMock === "msw" || useMock === "true") {
    return "";
  }

  // 生产模式：使用环境变量配置的后端 URL
  // 使用同域 /api，由生产环境反向代理转发。
  const isProductionMode = import.meta.env.VITE_PRODUCTION_MODE === "true";
  if (isProductionMode) {
    return "";
  }

  // 开发环境连接真实后端时使用相对路径，交给 Vite dev server 代理。
  // 避免通过局域网 IP / 远程 IDE 预览访问前端时，浏览器把 127.0.0.1
  // 解析成客户端自己的机器，导致登录请求显示网络错误。
  if (import.meta.env.DEV && useMock === "false") {
    return "";
  }

  // 其他非生产环境保留显式配置
  return import.meta.env.VITE_API_BASE_URL || "";
}

// ========================================
// 创建 Axios 实例
// ========================================
export const api = axios.create({
  baseURL: getApiBaseURL(),
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
}) as CustomAxiosInstance;

// ========================================
// 请求拦截器
// ========================================
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (
      typeof FormData !== "undefined" &&
      config.data instanceof FormData &&
      config.headers
    ) {
      config.headers.delete?.("Content-Type");
      config.headers.delete?.("content-type");
    }

    // 1. 添加 Authorization 头部（与内存中的可信会话保持一致）
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 2. 开发环境日志
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    }

    return config;
  },
  (error) => {
    console.error("[API Request Error]", error);
    return Promise.reject(error);
  }
);

// ========================================
// 响应拦截器
// ========================================
api.interceptors.response.use(
  (response) => {
    // 开发环境日志
    if (import.meta.env.DEV) {
      console.log(`[API] Response ${response.config.url}:`, response.data);
    }

    // 直接返回 data 部分
    return response.data;
  },
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message || error.message;

    // 401 是会话失效信号：同步清理 Zustand 与 React Query，路由守卫再按
    // 当前页面决定进入游客首页还是登录页，避免公开首页被全局强制跳转。
    if (status === 401) {
      useAuthStore.getState().clearAuth();
      clearProtectedImageObjectUrlCache();
      queryClient.clear();
      if (import.meta.env.DEV) {
        console.warn("[API] 登录状态已失效", { url: error.config?.url });
      }
    } else {
      console.error("[API Error]", { status, message, url: error.config?.url });
    }

    return Promise.reject(error);
  }
);

// ========================================
// 导出
// ========================================
export default api;
