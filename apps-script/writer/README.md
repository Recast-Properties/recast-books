# Recast Books Writer - setup

1. script.google.com -> New project, named "Recast Books Writer".
2. Paste `Code.gs` in; add `appsscript.json` via Project Settings ->
   "Show appsscript.json in editor".
3. Run `setup` once (function dropdown -> setup -> Run). Grant permissions.
4. View -> Logs (or Executions) -> copy the workbook URL and WRITER_SECRET.
5. Deploy -> New deployment -> Web app. Execute as: Me. Access: Anyone.
6. Copy the `/exec` URL.
7. In the Netlify site `recast-books`, set env vars:
   `WRITER_URL` = the `/exec` URL, `WRITER_SECRET` = the secret from step 4.
8. Re-running `setup` is safe: same workbook, same secret, no-op.
9. Visit the `/exec` URL in a browser - it should show `{"ok":true,...}`.
