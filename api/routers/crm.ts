import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, authedQuery } from "../middleware";
import { db } from "../db";
import type {
  Clients,
  CrmContactRelationships,
  CrmContacts,
  CrmOrganisations,
  Interactions,
  Mentions,
  StaffProfiles,
  Tasks,
  Teams,
  TicketComments,
  TicketEvents,
  Tickets,
  TicketWatchers,
} from "@db/schema";
import { getStaff, requireRole, audit, notify, notifyRoles, nextTicketNo, SLA_MINUTES } from "../util";
import { callAI } from "../ai/provider";

const MGMT_ROLES = ["super_admin", "admin", "team_leader"] as const;

function canSeeTicket(role: string, ticket: Tickets) {
  if (ticket.category === "safeguarding_concern") return (MGMT_ROLES as readonly string[]).includes(role);
  return true;
}

async function ticketWithEvents(id: number) {
  return db.from("tickets").eq("id", id).first<Tickets>();
}

async function recordEvent(ticketId: number, actorName: string, event: string, from?: string | null, to?: string | null) {
  await db.from("ticketEvents").insert({
    ticketId, actorName, event, fromValue: from ?? null, toValue: to ?? null,
  });
}

async function addWatcher(ticketId: number, staffId: number, reason: "tagged" | "assigned" | "escalated" | "manual" | "follower") {
  const has = await db.from("ticketWatchers")
    .eq("ticketId", ticketId)
    .eq("staffId", staffId)
    .first<TicketWatchers>();
  if (!has) await db.from("ticketWatchers").insert({ ticketId, staffId, reason });
}

export const crmRouter = createRouter({
  // ── Contacts ──
  contacts: authedQuery
    .input(z.object({ q: z.string().optional(), type: z.string().optional() }))
    .query(async ({ input }) => {
      let query = db.from("crmContacts").isNull("deletedAt");
      if (input.q) {
        const q = `%${input.q}%`;
        query = query.or([
          { op: "like", field: "firstName", value: q },
          { op: "like", field: "lastName", value: q },
          { op: "like", field: "phone", value: q },
          { op: "like", field: "email", value: q },
        ]);
      }
      if (input.type) query = query.eq("contactType", input.type);
      const rows = await query.order("updatedAt", "desc").limit(200).many<CrmContacts>();
      const orgs = await db.from("crmOrganisations").many<CrmOrganisations>();
      const openTickets = await db.from("tickets").notIn("status", ["resolved", "closed"]).many<Tickets>();
      return rows.map((c) => ({
        ...c,
        organisation: orgs.find((o) => o.id === c.organisationId),
        openTicketCount: openTickets.filter((t) => t.requesterContactId === c.id).length,
      }));
    }),

  createContact: authedQuery
    .input(z.object({
      contactType: z.enum(["client", "family_member", "next_of_kin", "care_worker", "candidate", "commissioner", "social_worker", "gp_practice", "hospital", "supplier", "prospective_client", "other"]),
      firstName: z.string().min(1), lastName: z.string().min(1),
      email: z.string().email().optional().or(z.literal("")), phone: z.string().optional(),
      jobTitle: z.string().optional(), organisationId: z.number().optional(),
      preferredChannel: z.enum(["phone", "email", "sms", "letter"]).default("phone"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      // duplicate detection
      if (input.email) {
        const dup = await db.from("crmContacts").eq("email", input.email).isNull("deletedAt").first<CrmContacts>();
        if (dup) throw new TRPCError({ code: "CONFLICT", message: `A contact with this email already exists: ${dup.firstName} ${dup.lastName}.` });
      }
      const [row] = await db.from("crmContacts").insert<CrmContacts>({
        contactType: input.contactType, firstName: input.firstName, lastName: input.lastName,
        email: input.email || null, phone: input.phone || null, jobTitle: input.jobTitle || null,
        organisationId: input.organisationId ?? null, preferredChannel: input.preferredChannel,
        communicationNotes: input.notes || null, ownerId: sc.staff.id, lifecycleStage: input.contactType === "prospective_client" ? "enquiry" : "n_a",
      });
      await audit(sc.staff.fullName, "contact_created", "crm_contacts", row.id);
      return { id: row.id };
    }),

  contactDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const c = await db.from("crmContacts").eq("id", input.id).first<CrmContacts>();
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const org = c.organisationId ? await db.from("crmOrganisations").eq("id", c.organisationId).first<CrmOrganisations>() : null;
      const rels = await db.from("crmContactRelationships").or([
        { op: "eq", field: "contactId", value: c.id },
        { op: "eq", field: "relatedContactId", value: c.id },
      ]).many<CrmContactRelationships>();
      const allContacts = await db.from("crmContacts").many<CrmContacts>();
      const related = rels.map((r) => ({
        ...r,
        other: allContacts.find((x) => x.id === (r.contactId === c.id ? r.relatedContactId : r.contactId)),
      }));
      const timeline = await db.from("interactions").eq("contactId", c.id)
        .order("occurredAt", "desc").limit(100).many<Interactions>();
      const openTickets = await db.from("tickets")
        .eq("requesterContactId", c.id)
        .notIn("status", ["resolved", "closed"])
        .many<Tickets>();
      const contactTasks = await db.from("tasks")
        .eq("relatedType", "contact")
        .eq("relatedId", c.id)
        .eq("status", "open")
        .many<Tasks>();
      const linkedClient = c.linkedClientId ? await db.from("clients").eq("id", c.linkedClientId).first<Clients>() : null;
      const ticketIds = timeline.map((t) => t.ticketId).filter(Boolean);
      const allTickets = ticketIds.length ? await db.from("tickets").many<Tickets>() : [];
      return {
        contact: c, organisation: org, related, timeline, openTickets, tasks: contactTasks,
        linkedClient,
        ticketMap: Object.fromEntries(allTickets.filter((t) => ticketIds.includes(t.id)).map((t) => [t.id, t.ticketNo])),
      };
    }),

  summariseContact: authedQuery
    .input(z.object({ contactId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await getStaff(ctx);
      const timeline = await db.from("interactions").eq("contactId", input.contactId)
        .order("occurredAt", "desc").limit(40).many<Interactions>();
      if (!timeline.length) throw new TRPCError({ code: "BAD_REQUEST", message: "No interactions to summarise yet." });
      const result = await callAI({
        feature: "summariseContactHistory", promptVersion: "1.0", temperature: 0.4,
        schema: z.object({ summary: z.string(), openIssues: z.array(z.string()), suggestedFollowUp: z.string() }),
        system: "Summarise the last 90 days of contact history for a care-provider CRM. Be factual, cite dates. Strict JSON.",
        user: timeline.map((t) => `[${new Date(t.occurredAt).toISOString().slice(0, 10)}] ${t.type}: ${t.subject ?? ""} — ${(t.body ?? "").slice(0, 200)}`).join("\n"),
      });
      return result;
    }),

  organisations: authedQuery.query(async () => {
    const orgs = await db.from("crmOrganisations").many<CrmOrganisations>();
    const contacts = await db.from("crmContacts").isNull("deletedAt").many<CrmContacts>();
    return orgs.map((o) => ({ ...o, contactCount: contacts.filter((c) => c.organisationId === o.id).length }));
  }),

  // ── Interactions / calls ──
  logInteraction: authedQuery
    .input(z.object({
      type: z.enum(["inbound_call", "outbound_call", "missed_call", "voicemail", "email_in", "email_out", "sms_in", "sms_out", "meeting", "note", "letter", "web_form"]),
      contactId: z.number().optional(), clientId: z.number().optional(),
      subject: z.string().min(2), body: z.string().optional(),
      durationSeconds: z.number().optional(), outcome: z.string().optional(),
      createFollowUp: z.enum(["none", "tomorrow", "3days", "week"]).default("none"),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const direction = input.type.startsWith("inbound") || input.type === "missed_call" || input.type === "voicemail" || ["email_in", "sms_in", "web_form"].includes(input.type) ? "inbound" : input.type === "note" ? "internal" : "outbound";
      const [row] = await db.from("interactions").insert<Interactions>({
        type: input.type, direction, contactId: input.contactId ?? null,
        clientId: input.clientId ?? null, subject: input.subject, body: input.body ?? null,
        occurredAt: new Date(), durationSeconds: input.durationSeconds ?? null,
        loggedBy: sc.staff.fullName, outcome: input.outcome ?? null,
      });
      // automation: missed call / voicemail → return-call task
      if (input.type === "missed_call" || input.type === "voicemail") {
        await db.from("tasks").insert({
          title: `Return call: ${input.subject}`, description: input.body ?? null,
          dueAt: new Date(Date.now() + 4 * 36e5), assigneeId: sc.staff.id,
          assigneeName: sc.staff.fullName, createdByName: "System",
          relatedType: input.contactId ? "contact" : "none", relatedId: input.contactId ?? null,
          priority: "high",
        });
      }
      if (input.createFollowUp !== "none") {
        const days = { tomorrow: 1, "3days": 3, week: 7 }[input.createFollowUp];
        await db.from("tasks").insert({
          title: `Follow up: ${input.subject}`, dueAt: new Date(Date.now() + days * 864e5),
          assigneeId: sc.staff.id, assigneeName: sc.staff.fullName, createdByName: sc.staff.fullName,
          relatedType: input.contactId ? "contact" : "none", relatedId: input.contactId ?? null,
        });
      }
      await audit(sc.staff.fullName, "interaction_logged", "interactions", row.id, { type: input.type });
      return { id: row.id };
    }),

  lookupCaller: authedQuery
    .input(z.object({ phone: z.string().min(5) }))
    .query(async ({ input }) => {
      const digits = input.phone.replace(/\D/g, "").slice(-10);
      const contacts = await db.from("crmContacts").isNull("deletedAt").many<CrmContacts>();
      const match = contacts.find((c) => (c.phone ?? "").replace(/\D/g, "").slice(-10) === digits);
      if (!match) return { contact: null, openTickets: [], recent: [] };
      const openTickets = await db.from("tickets")
        .eq("requesterContactId", match.id)
        .notIn("status", ["resolved", "closed"])
        .many<Tickets>();
      const recent = await db.from("interactions").eq("contactId", match.id)
        .order("occurredAt", "desc").limit(3).many<Interactions>();
      return { contact: match, openTickets, recent };
    }),

  // ── Tickets ──
  tickets: authedQuery
    .input(z.object({
      status: z.string().optional(), category: z.string().optional(),
      assignee: z.number().optional(), view: z.enum(["all", "mine", "unassigned", "due_today", "overdue", "escalated"]).default("all"),
      q: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      let rows = await db.from("tickets").order("updatedAt", "desc").limit(300).many<Tickets>();
      // visibility: safeguarding tickets only for management
      rows = rows.filter((t) => canSeeTicket(sc.staff.role, t));
      const now = Date.now();
      if (input.view === "mine") rows = rows.filter((t) => Number(t.assigneeId) === Number(sc.staff.id));
      if (input.view === "unassigned") rows = rows.filter((t) => !t.assigneeId);
      if (input.view === "due_today") rows = rows.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now + 864e5 && !["resolved", "closed"].includes(t.status));
      if (input.view === "overdue") rows = rows.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < now && !["resolved", "closed"].includes(t.status));
      if (input.view === "escalated") rows = rows.filter((t) => t.status === "escalated" || (t.escalationLevel ?? 0) > 0);
      if (input.status) rows = rows.filter((t) => t.status === input.status);
      if (input.category) rows = rows.filter((t) => t.category === input.category);
      if (input.q) rows = rows.filter((t) => `${t.ticketNo} ${t.subject}`.toLowerCase().includes(input.q!.toLowerCase()));
      const contacts = await db.from("crmContacts").many<CrmContacts>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      const teamRows = await db.from("teams").many<Teams>();
      return rows.map((t) => ({
        ...t,
        requester: contacts.find((c) => c.id === t.requesterContactId),
        assignee: staff.find((s2) => s2.id === t.assigneeId),
        team: teamRows.find((x) => x.id === t.teamId),
        slaBreached: t.dueAt ? new Date(t.dueAt).getTime() < now && !["resolved", "closed"].includes(t.status) : false,
      }));
    }),

  createTicket: authedQuery
    .input(z.object({
      subject: z.string().min(3), description: z.string().optional(),
      category: z.enum(["care_query", "complaint", "compliment", "safeguarding_concern", "rota_change", "missed_or_late_visit", "billing_invoice", "new_care_enquiry", "recruitment_query", "hr_staff_query", "medication_query", "commissioner_request", "general"]),
      priority: z.enum(["low", "normal", "high", "urgent"]),
      channel: z.enum(["phone", "email", "sms", "web", "walk_in", "internal"]),
      requesterContactId: z.number().optional(), clientId: z.number().optional(),
      assigneeId: z.number().optional(), teamId: z.number().optional(),
      useAiClassify: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      let category = input.category;
      let priority = input.priority;
      if (input.useAiClassify && input.description) {
        const cls = await callAI({
          feature: "classifyTicket", promptVersion: "1.0", temperature: 0.2,
          schema: z.object({
            category: z.enum(["care_query", "complaint", "compliment", "safeguarding_concern", "rota_change", "missed_or_late_visit", "billing_invoice", "new_care_enquiry", "recruitment_query", "hr_staff_query", "medication_query", "commissioner_request", "general"]),
            priority: z.enum(["low", "normal", "high", "urgent"]),
            safeguarding: z.boolean(), rationale: z.string(),
          }),
          system: "Classify an inbound query for a UK domiciliary care provider's helpdesk. Flag anything that suggests risk to a vulnerable adult as safeguarding. Strict JSON.",
          user: `Subject: ${input.subject}\n\n${input.description}`,
        });
        category = cls.safeguarding ? "safeguarding_concern" : cls.category;
        priority = cls.safeguarding ? "urgent" : cls.priority;
      }
      if (category === "safeguarding_concern") priority = "urgent";
      const [firstResp, resolution] = SLA_MINUTES[priority];
      const ticketNo = await nextTicketNo();
      const [row] = await db.from("tickets").insert<Tickets>({
        ticketNo, subject: input.subject, description: input.description ?? null,
        category, priority, status: "new", channel: input.channel,
        requesterContactId: input.requesterContactId ?? null, clientId: input.clientId ?? null,
        assigneeId: input.assigneeId ?? null, teamId: input.teamId ?? null,
        firstResponseDueAt: new Date(Date.now() + firstResp * 60000),
        dueAt: new Date(Date.now() + resolution * 60000),
        isFormalComplaint: category === "complaint",
      });
      const id = row.id;
      await recordEvent(id, sc.staff.fullName, "created", null, "new");
      if (input.assigneeId) {
        await addWatcher(id, input.assigneeId, "assigned");
        await notify({ staffId: input.assigneeId, type: "ticket", title: `Ticket ${ticketNo} assigned to you`, body: input.subject, link: `/crm/tickets/${id}` });
        await recordEvent(id, sc.staff.fullName, "assigned", null, String(input.assigneeId));
      }
      if (category === "safeguarding_concern") {
        await notifyRoles(["super_admin", "team_leader"], { type: "safeguarding", title: `SAFEGUARDING: ${ticketNo}`, body: input.subject, link: `/crm/tickets/${id}` });
      }
      await audit(sc.staff.fullName, "ticket_created", "tickets", id, { ticketNo, category, priority });
      return { id, ticketNo };
    }),

  ticketDetail: authedQuery
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const t = await ticketWithEvents(input.id);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canSeeTicket(sc.staff.role, t)) throw new TRPCError({ code: "FORBIDDEN", message: "Safeguarding tickets are restricted to management roles." });
      const contacts = await db.from("crmContacts").many<CrmContacts>();
      const staff = await db.from("staffProfiles").many<StaffProfiles>();
      const comments = await db.from("ticketComments").eq("ticketId", t.id).order("createdAt", "asc").many<TicketComments>();
      const events = await db.from("ticketEvents").eq("ticketId", t.id).order("at", "asc").many<TicketEvents>();
      const watchers = await db.from("ticketWatchers").eq("ticketId", t.id).many<TicketWatchers>();
      const teamRows = await db.from("teams").many<Teams>();
      const timeline = await db.from("interactions").eq("ticketId", t.id).order("occurredAt", "desc").many<Interactions>();
      const client = t.clientId ? await db.from("clients").eq("id", t.clientId).first<Clients>() : null;
      return {
        ticket: t,
        requester: contacts.find((c) => c.id === t.requesterContactId),
        assignee: staff.find((s2) => s2.id === t.assigneeId),
        client,
        comments, events, team: teamRows.find((x) => x.id === t.teamId),
        watchers: watchers.map((w) => ({ ...w, staff: staff.find((s2) => s2.id === w.staffId) })),
        timeline,
        allStaff: staff.map((s2) => ({ id: s2.id, fullName: s2.fullName, role: s2.role })),
        teams: teamRows,
      };
    }),

  updateTicket: authedQuery
    .input(z.object({
      id: z.number(), status: z.enum(["new", "open", "in_progress", "waiting_on_customer", "waiting_on_internal", "escalated", "resolved", "closed", "reopened"]).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      assigneeId: z.number().nullable().optional(), teamId: z.number().nullable().optional(),
      resolutionSummary: z.string().optional(), resolutionCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const t = await ticketWithEvents(input.id);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canSeeTicket(sc.staff.role, t)) throw new TRPCError({ code: "FORBIDDEN" });
      const patch: Record<string, unknown> = {};
      if (input.status && input.status !== t.status) {
        if (input.status === "resolved") {
          if (!input.resolutionSummary) throw new TRPCError({ code: "BAD_REQUEST", message: "A resolution summary is required to resolve a ticket." });
          patch.resolvedAt = new Date();
          patch.resolutionSummary = input.resolutionSummary;
          patch.resolutionCode = input.resolutionCode ?? null;
        }
        if (input.status === "closed") patch.closedAt = new Date();
        patch.status = input.status;
        await recordEvent(t.id, sc.staff.fullName, "status_changed", t.status, input.status);
      }
      if (input.priority && input.priority !== t.priority) {
        patch.priority = input.priority;
        await recordEvent(t.id, sc.staff.fullName, "priority_changed", t.priority, input.priority);
      }
      if (input.assigneeId !== undefined && input.assigneeId !== (t.assigneeId ?? null)) {
        patch.assigneeId = input.assigneeId;
        if (input.assigneeId) {
          await addWatcher(t.id, input.assigneeId, "assigned");
          await notify({ staffId: input.assigneeId, type: "ticket", title: `Ticket ${t.ticketNo} assigned to you`, body: t.subject, link: `/crm/tickets/${t.id}` });
        }
        await recordEvent(t.id, sc.staff.fullName, "assigned", String(t.assigneeId ?? ""), String(input.assigneeId ?? ""));
      }
      if (!t.firstRespondedAt && (input.status || input.assigneeId)) patch.firstRespondedAt = new Date();
      if (Object.keys(patch).length) {
        await db.from("tickets").eq("id", t.id).update(patch);
        await audit(sc.staff.fullName, "ticket_updated", "tickets", t.id, patch);
      }
      return { ok: true };
    }),

  escalateTicket: authedQuery
    .input(z.object({
      id: z.number(), toStaffId: z.number().optional(), toTeamId: z.number().optional(),
      reason: z.string().min(5),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const t = await ticketWithEvents(input.id);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canSeeTicket(sc.staff.role, t)) throw new TRPCError({ code: "FORBIDDEN" });
      await db.from("tickets").eq("id", t.id).update({
        status: "escalated", escalationLevel: (t.escalationLevel ?? 0) + 1,
        assigneeId: input.toStaffId ?? t.assigneeId, teamId: input.toTeamId ?? t.teamId,
      });
      if (input.toStaffId) {
        await addWatcher(t.id, input.toStaffId, "escalated");
        await notify({ staffId: input.toStaffId, type: "escalation", title: `ESCALATED: ${t.ticketNo}`, body: input.reason, link: `/crm/tickets/${t.id}` });
      }
      for (const w of await db.from("ticketWatchers").eq("ticketId", t.id).many<TicketWatchers>()) {
        await notify({ staffId: w.staffId, type: "escalation", title: `${t.ticketNo} escalated to level ${(t.escalationLevel ?? 0) + 1}`, body: input.reason, link: `/crm/tickets/${t.id}` });
      }
      await recordEvent(t.id, sc.staff.fullName, "escalated", String(t.escalationLevel), String((t.escalationLevel ?? 0) + 1));
      await audit(sc.staff.fullName, "ticket_escalated", "tickets", t.id, { reason: input.reason });
      return { ok: true };
    }),

  addComment: authedQuery
    .input(z.object({
      ticketId: z.number(), body: z.string().min(1),
      visibility: z.enum(["internal", "public"]).default("internal"),
      mentionedStaffIds: z.array(z.number()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const t = await ticketWithEvents(input.ticketId);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canSeeTicket(sc.staff.role, t)) throw new TRPCError({ code: "FORBIDDEN" });
      const [row] = await db.from("ticketComments").insert<TicketComments>({
        ticketId: t.id, authorId: sc.staff.id, authorName: sc.staff.fullName,
        body: input.body, visibility: input.visibility, mentions: input.mentionedStaffIds as never,
      });
      const commentId = row.id;
      await recordEvent(t.id, sc.staff.fullName, "commented");
      if (!t.firstRespondedAt) await db.from("tickets").eq("id", t.id).update({ firstRespondedAt: new Date() });
      // requester public reply reopens a resolved ticket within 7 days
      if (input.visibility === "public" && t.status === "resolved" && t.resolvedAt && Date.now() - new Date(t.resolvedAt).getTime() < 7 * 864e5) {
        await db.from("tickets").eq("id", t.id).update({ status: "reopened", resolvedAt: null });
        await recordEvent(t.id, "System", "reopened", "resolved", "reopened");
        if (t.assigneeId) await notify({ staffId: t.assigneeId, type: "ticket", title: `${t.ticketNo} reopened`, body: "A reply arrived on a resolved ticket.", link: `/crm/tickets/${t.id}` });
      }
      // @-mentions: add watchers + notify
      for (const sid of input.mentionedStaffIds) {
        await addWatcher(t.id, sid, "tagged");
        const staff = await db.from("staffProfiles").eq("id", sid).first<StaffProfiles>();
        await db.from("mentions").insert({
          mentionedStaffId: sid, byName: sc.staff.fullName, sourceType: "ticket_comment",
          sourceId: commentId, sourceLabel: `${t.ticketNo} — ${t.subject}`,
        });
        await notify({ staffId: sid, type: "mention", title: `${sc.staff.fullName} mentioned you in ${t.ticketNo}`, body: input.body.slice(0, 140), link: `/crm/tickets/${t.id}` });
        void staff;
      }
      // email-style log for public replies
      if (input.visibility === "public" && t.requesterContactId) {
        await db.from("interactions").insert({
          type: "email_out", direction: "outbound", contactId: t.requesterContactId, ticketId: t.id,
          subject: `Re: ${t.subject} [${t.ticketNo}]`, body: input.body, occurredAt: new Date(),
          loggedBy: sc.staff.fullName, outcome: "public_reply",
        });
        await recordEvent(t.id, sc.staff.fullName, "emailed");
      }
      return { id: commentId };
    }),

  draftReply: authedQuery
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      const t = await ticketWithEvents(input.ticketId);
      if (!t) throw new TRPCError({ code: "NOT_FOUND" });
      const comments = await db.from("ticketComments").eq("ticketId", t.id).order("createdAt", "asc").many<TicketComments>();
      const result = await callAI({
        feature: "draftReply", promptVersion: "1.0", temperature: 0.4,
        schema: z.object({ draft: z.string(), tone: z.string(), pointsAddressed: z.array(z.string()) }),
        system: "Draft a reply from Unique Care UK (domiciliary care provider). Calm, warm, professional UK English. Acknowledge, state the action being taken, give a timeframe. Never promise medical outcomes. Strict JSON. A human reviews before sending.",
        user: `Ticket ${t.ticketNo} [${t.category}/${t.priority}]: ${t.subject}\n${t.description ?? ""}\n\nThread so far:\n${comments.map((c) => `${c.authorName} (${c.visibility}): ${c.body}`).join("\n")}`,
      });
      void sc;
      return result;
    }),

  followTicket: authedQuery
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      await addWatcher(input.ticketId, Number(sc.staff.id), "follower");
      return { ok: true };
    }),

  // ── Tasks ──
  myTasks: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    const mine = await db.from("tasks").eq("assigneeId", sc.staff.id).order("dueAt", "asc").many<Tasks>();
    const now = Date.now();
    return {
      overdue: mine.filter((t) => t.status === "open" && t.dueAt && new Date(t.dueAt).getTime() < now),
      today: mine.filter((t) => t.status === "open" && t.dueAt && new Date(t.dueAt).getTime() >= now && new Date(t.dueAt).getTime() < now + 864e5),
      upcoming: mine.filter((t) => t.status === "open" && (!t.dueAt || new Date(t.dueAt).getTime() >= now + 864e5)),
      done: mine.filter((t) => t.status === "done").slice(0, 20),
    };
  }),

  completeTask: authedQuery
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const sc = await getStaff(ctx);
      await db.from("tasks").eq("id", input.id).eq("assigneeId", sc.staff.id).update({ status: "done" });
      return { ok: true };
    }),

  // ── Mentions ──
  myMentions: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    return db.from("mentions").eq("mentionedStaffId", sc.staff.id)
      .order("createdAt", "desc").limit(50).many<Mentions>();
  }),

  // ── Reports ──
  crmStats: authedQuery.query(async ({ ctx }) => {
    const sc = await getStaff(ctx);
    requireRole(sc, "super_admin", "admin", "team_leader", "crm_agent", "care_coordinator");
    const all = await db.from("tickets").many<Tickets>();
    const visible = all.filter((t) => canSeeTicket(sc.staff.role, t));
    const now = Date.now();
    const byCategory: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let frtSum = 0, frtN = 0, resSum = 0, resN = 0, breaches = 0, escalations = 0, reopened = 0, csatSum = 0, csatN = 0;
    for (const t of visible) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
      byChannel[t.channel] = (byChannel[t.channel] ?? 0) + 1;
      byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
      if (t.firstRespondedAt) { frtSum += (new Date(t.firstRespondedAt).getTime() - new Date(t.createdAt).getTime()) / 60000; frtN++; }
      if (t.resolvedAt) { resSum += (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 36e5; resN++; }
      if (t.dueAt && new Date(t.dueAt).getTime() < now && !["resolved", "closed"].includes(t.status)) breaches++;
      if ((t.escalationLevel ?? 0) > 0) escalations++;
      if (t.status === "reopened") reopened++;
      if (t.satisfactionScore) { csatSum += t.satisfactionScore; csatN++; }
    }
    const calls = await db.from("interactions").in("type", ["inbound_call", "outbound_call", "missed_call", "voicemail"]).many<Interactions>();
    const missedCalls = calls.filter((c) => c.type === "missed_call").length;
    return {
      total: visible.length, byCategory, byChannel, byStatus,
      avgFirstResponseMin: frtN ? Math.round(frtSum / frtN) : null,
      avgResolutionHrs: resN ? Number((resSum / resN).toFixed(1)) : null,
      slaBreaches: breaches, escalations, reopened,
      csat: csatN ? Number((csatSum / csatN).toFixed(1)) : null,
      callsTotal: calls.length, missedCalls,
      missedCallRate: calls.length ? Math.round((missedCalls / calls.length) * 100) : 0,
    };
  }),
});
