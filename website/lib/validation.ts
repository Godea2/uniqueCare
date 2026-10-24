import { z } from "zod";

const ukPhone = /^(\+44\s?|0)\d[\d\s]{8,12}$/;

export const enquirySchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address"),
  phone: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || ukPhone.test(v), "Please enter a valid UK phone number"),
  enquiryType: z.enum(["Care Enquiry", "Careers", "General Enquiry", "Feedback"]).default("Care Enquiry"),
  careType: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10, "Please tell us a little more (at least 10 characters)").max(2000, "Message is too long"),
  service: z.string().trim().max(100).optional(),
  // honeypot — must stay empty
  website: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});

export const reviewSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  relationship: z.enum(["Service User", "Family Member", "Healthcare Professional", "Carer / Staff", "Other"]),
  rating: z.coerce.number().int().min(1, "Please choose a rating").max(5),
  title: z.string().trim().min(2, "Please give your review a title").max(100, "Title is too long"),
  body: z.string().trim().min(20, "Please write at least 20 characters").max(2000, "Review is too long"),
  website: z.string().max(0).optional(),
  turnstileToken: z.string().optional(),
});

export type EnquiryInput = z.infer<typeof enquirySchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;

export async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // not configured — honeypot + rate limit still apply
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success;
  } catch {
    return false;
  }
}
