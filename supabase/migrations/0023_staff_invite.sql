-- Invite-only staff accounts: who may invite others is decided at creation
-- (and can be revoked later). Existing Registered Managers keep invite rights.

alter table public.staff_profiles
  add column if not exists can_invite_users boolean not null default false;

update public.staff_profiles
   set can_invite_users = true
 where (coalesce(home_role, role) = 'super_admin')
   and deleted_at is null;

comment on column public.staff_profiles.can_invite_users is
  'When true, this person may open User management and invite/revoke staff. Registered Managers always can.';
