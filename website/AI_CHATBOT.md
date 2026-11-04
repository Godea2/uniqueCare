# Website AI chatbot

Visitors see a floating assistant on every public page. Registered Managers control it in the **staff portal → Website → AI Assistant**.

## Portal controls

| Page | Purpose |
|------|---------|
| **AI Assistant** | Overview, enable/disable status |
| **Knowledge** | Upload PDF / DOCX / TXT / MD; re-index; preview; delete |
| **Prompt** | System instructions, welcome message, version history |
| **Test** | Ask the bot privately before publishing |

## Public behaviour

- Widget: bottom-right, session chat history in `sessionStorage`
- Answers use Gemini + ranked knowledge chunks (no fabrication mandate in the system prompt)
- If disabled or no key: polite fallback to phone / contact form

## Apply migration

Run `website/supabase/migrations/0006_website_ai_chatbot.sql` on the shared Supabase project.

## Env (website)

```
GEMINI_API_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…   # read settings + chunks server-side
RESEND_API_KEY=…              # contact form → info@uniquecareuk.com
EMAIL_TO=info@uniquecareuk.com
```

## Env (portal)

Uses existing `GEMINI_API_KEY` for the test console and document indexing.
