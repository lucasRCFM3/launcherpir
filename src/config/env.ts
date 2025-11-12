const env = import.meta.env as Record<string, string | undefined>;

export const REMOTE_STORE_URL: string = env.VITE_STORE_REMOTE_URL ?? '';
export const STORE_EXPORT_PATH: string = env.VITE_STORE_EXPORT_PATH ?? '';
