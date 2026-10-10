import { ErrorMessages } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { canUseApp, getStaff } from "./util";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requireRole(role: string) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== role) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

const requireApprovedStaff = t.middleware(async ({ ctx, next }) => {
  const { staff } = await getStaff(ctx);
  if (!canUseApp(staff)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: staff.status === "pending"
        ? "Your account is waiting for an administrator to approve it."
        : "Your account no longer has access to UniqueCare Connect.",
    });
  }
  return next();
});

/** Signed in, approved or not. Only for account/self-service endpoints. */
export const signedInQuery = t.procedure.use(requireAuth);
/** Signed in and approved as staff. Default for every staff endpoint. */
export const authedQuery = signedInQuery.use(requireApprovedStaff);
export const adminQuery = authedQuery.use(requireRole("admin"));
