import { createRouter, signedInQuery } from "./middleware";

export const authRouter = createRouter({
  me: signedInQuery.query((opts) => opts.ctx.user),
  logout: signedInQuery.mutation(() => ({ success: true })),
});
