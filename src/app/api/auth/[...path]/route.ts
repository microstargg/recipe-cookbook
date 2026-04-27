import { auth } from "@/lib/auth/server";

const h = auth.handler();
export const GET = h.GET;
export const POST = h.POST;
export const PUT = h.PUT;
export const DELETE = h.DELETE;
export const PATCH = h.PATCH;
