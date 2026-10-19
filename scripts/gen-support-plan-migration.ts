import { writeFileSync } from "fs";
import {
  SUPPORT_PLAN_NAME,
  SUPPORT_PLAN_TEMPLATE,
  SUPPORT_PLAN_VERSION,
} from "../contracts/support-plan";

const structure = JSON.stringify(SUPPORT_PLAN_TEMPLATE).replace(/'/g, "''");
const name = SUPPORT_PLAN_NAME.replace(/'/g, "''");
const version = SUPPORT_PLAN_VERSION;

const sql = `-- Person-centred support plan template
-- Source of truth: contracts/support-plan.ts
-- Runtime ensure: api/lib/ensure-support-plan-template.ts

update public.document_templates
set active = false
where kind = 'support_plan' and active = true
  and (structure->>'format' is distinct from 'person_centred_v1');

insert into public.document_templates (kind, version, name, structure, active)
select 'support_plan', ${version}, '${name}', '${structure}'::jsonb, true
where not exists (
  select 1 from public.document_templates
  where kind = 'support_plan' and version = ${version}
);

update public.document_templates
set active = true,
    name = '${name}',
    structure = '${structure}'::jsonb
where kind = 'support_plan' and version = ${version};

update public.document_templates
set active = false
where kind = 'support_plan' and version is distinct from ${version};
`;

writeFileSync("./supabase/migrations/0018_support_plan_person_centred.sql", sql);
console.log("wrote 0018_support_plan_person_centred.sql", sql.length, "chars");
