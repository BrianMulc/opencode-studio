---
"opencode-studio-server": minor
---

Dramatically faster startup: the app now runs the precompiled production build of the client (`next start`) instead of the Next.js dev server, which compiled every route on demand and could take minutes to show the first page on slower laptops (especially with antivirus scanning). The client is built once at install time and after each in-app update. If no build exists, the launcher falls back to dev mode as before. Browser auto-open now also waits up to 5 minutes for slow first boots instead of giving up after 70 seconds.
