import { join } from "path";

/**
 * Where guest-mode generated assets live on disk.
 *
 * Deliberately OUTSIDE `public/`. Next.js enumerates `public/` once at server
 * boot and only serves files present in that snapshot, so anything written at
 * runtime — which is exactly what generated assets are — 404s until the next
 * restart. These are served by `app/generated/[...path]/route.ts` instead.
 *
 * Override with GENERATED_DIR to point at a mounted volume.
 */
export const GENERATED_DIR =
  process.env.GENERATED_DIR ?? join(process.cwd(), "storage", "generated");
