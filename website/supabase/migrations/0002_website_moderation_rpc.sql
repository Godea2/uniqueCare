-- Secret-gated moderation RPC for website_reviews. Lets the website's server
-- (which knows REVIEW_MODERATION_SECRET) approve/reject reviews without a
-- service role key in any browser code. New object only.
-- Replace the literal below with your own secret and keep it in sync with the
-- website's REVIEW_MODERATION_SECRET environment variable.

create or replace function public.website_moderate_review(p_id uuid, p_action text, p_secret text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_secret is null or p_secret = '' or p_secret is distinct from 'CHANGE-ME' then
    return false;
  end if;
  if p_action not in ('approve', 'reject') then
    return false;
  end if;
  update public.website_reviews
     set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
         approved_at = case when p_action = 'approve' then now() else null end
   where id = p_id and status = 'pending';
  return found;
end;
$$;

revoke all on function public.website_moderate_review(uuid, text, text) from public;
grant execute on function public.website_moderate_review(uuid, text, text) to anon, authenticated;
