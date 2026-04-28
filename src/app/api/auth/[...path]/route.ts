import { auth } from "@/lib/auth/server";
import { normalizeAuthRequestOrigin } from "@/lib/auth/normalize-request-origin";

const h = auth.handler();

export const GET = (request: Request, ctx: Parameters<NonNullable<typeof h.GET>>[1]) =>
  h.GET!(normalizeAuthRequestOrigin(request), ctx);
export const POST = (request: Request, ctx: Parameters<NonNullable<typeof h.POST>>[1]) =>
  h.POST!(normalizeAuthRequestOrigin(request), ctx);
export const PUT = (request: Request, ctx: Parameters<NonNullable<typeof h.PUT>>[1]) =>
  h.PUT!(normalizeAuthRequestOrigin(request), ctx);
export const DELETE = (request: Request, ctx: Parameters<NonNullable<typeof h.DELETE>>[1]) =>
  h.DELETE!(normalizeAuthRequestOrigin(request), ctx);
export const PATCH = (request: Request, ctx: Parameters<NonNullable<typeof h.PATCH>>[1]) =>
  h.PATCH!(normalizeAuthRequestOrigin(request), ctx);
