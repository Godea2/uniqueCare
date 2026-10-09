import type { InsertUser, User } from "@db/schema";
import { db } from "../db";

export async function findUserByUnionId(unionId: string) {
  return db.from("users").eq("unionId", unionId).first<User>();
}

export async function upsertUser(data: InsertUser) {
  await db.from("users").upsert(
    { ...data, lastSignInAt: new Date().toISOString() },
    "unionId",
  );
}
