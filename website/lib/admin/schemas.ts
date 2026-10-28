import { z } from "zod";
import { POST_CATEGORIES, POST_STATUSES } from "./mappers";

export const newsletterSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required").max(200),
  content: z.string().trim().min(1, "Content is required").max(50000),
});

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const imageUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https:\/\//i.test(v) || v.startsWith("/"), "Image must be an https:// URL or a /path")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const postSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(200),
  slug: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? slugify(v) : "")),
  category: z.enum(POST_CATEGORIES),
  imageUrl,
  excerpt: z.string().trim().max(500).default(""),
  content: z.string().max(100000).default(""),
  status: z.enum(POST_STATUSES).default("draft"),
});

export const backlinkSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(3, "Domain is required")
    .max(200)
    .transform((v) => v.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase()),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "URL must start with http:// or https://")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  status: z.enum(["pending", "acquired"]).default("pending"),
});
