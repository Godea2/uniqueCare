import { writeFileSync } from "fs";
import {
  CARE_PLAN_ASSESSMENT_NAME,
  CARE_PLAN_ASSESSMENT_TEMPLATE,
  CARE_PLAN_ASSESSMENT_VERSION,
} from "../contracts/care-plan-assessment";

const structure = JSON.stringify(CARE_PLAN_ASSESSMENT_TEMPLATE).replace(/'/g, "''");
const name = CARE_PLAN_ASSESSMENT_NAME.replace(/'/g, "''");
const version = CARE_PLAN_ASSESSMENT_VERSION;

const sql = `-- Full assessment care plan template (paper care plan structure)
-- Source of truth: contracts/care-plan-assessment.ts
-- Runtime ensure: api/lib/ensure-care-plan-template.ts

update public.document_templates
set active = false
where kind = 'care_plan' and active = true
  and (structure->>'format' is distinct from 'full_assessment_v1');

insert into public.document_templates (kind, version, name, structure, active)
select 'care_plan', ${version}, '${name}', '${structure}'::jsonb, true
where not exists (
  select 1 from public.document_templates
  where kind = 'care_plan' and version = ${version}
);

update public.document_templates
set active = true,
    name = '${name}',
    structure = '${structure}'::jsonb
where kind = 'care_plan' and version = ${version};

update public.document_templates
set active = false
where kind = 'care_plan' and version is distinct from ${version};
`;

writeFileSync("./supabase/migrations/0017_care_plan_full_assessment.sql", sql);
console.log("wrote 0017_care_plan_full_assessment.sql", sql.length, "chars");
