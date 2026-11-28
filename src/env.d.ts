// Build-time settings (read from .env.local; never commit real values).
interface ImportMetaEnv {
  /** Google OAuth Web client ID for Drive sync. Leave unset to hide the feature. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts at build time: build time and source hash (see lib/build.ts). */
declare const __APP_BUILD__: { time: string; source: string; commit?: string | null } | undefined;
