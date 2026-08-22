---
name: Gemini provider model availability
description: Runtime Gemini API errors can reveal model retirement for newly provisioned keys.
---

When a Gemini request returns a model-specific 404, inspect the provider response before changing auth or request structure; newly provisioned API keys may be restricted from older model identifiers.

**Why:** The first live request failed because the provider had retired the initially selected model for new users and returned the replacement explicitly.

**How to apply:** Preserve the provider's current supported model list in code and treat a model 404 as an availability/configuration issue, not automatically as an invalid key.