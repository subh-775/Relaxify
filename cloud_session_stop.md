# Turning off the cloud automation

Run when the $100 Claude credit is nearly used up, or whenever the owner says stop.
Two things run on their own; turn off both, then optionally remove the Google access.

## 1. Daily cloud audit (Claude routine)

- Name: **Relaxify daily audit**. Runs daily at 04:30 UTC (10:00 IST), Opus 5.5, opens one `audit/*` PR against `mobile` at most.
- Pause: in Claude Code, `RemoteTrigger` → `list`, then `update` that routine with `{"enabled": false}`.
- Delete: https://claude.ai/code/routines (deleting is only possible there).
- Afterwards: close or merge any open `audit/*` PRs and delete their branches.

## 2. Test Lab on every RC tag (GitHub Actions)

- Job `device-test` in `.github/workflows/build-android.yml` on `mobile`. Five Robo runs per RC tag (Samsung A15 5G, OnePlus Nord CE 3 Lite, realme C53, virtual Android 15, virtual 16 KB Android 16).
- Off without a commit: GitHub → Relaxify → Settings → Secrets and variables → Actions → Variables → add `DEVICE_TESTS` = `off`.
- Off for good: delete the `device-test` job from the workflow (the `build` job and releases don't depend on it).
- Costs nothing on the Spark plan (5 real-device + 10 virtual runs a day); runs past the quota just fail.

## 3. Google access, only if the CI job is removed for good

Project `relaxify-observability` (number 360613152004):

- Workload identity pool `github`, provider `relaxify` (trusts only `subh-775/Relaxify`).
- Service account `relaxify-testlab@relaxify-observability.iam.gserviceaccount.com`, roles: Test Lab Admin, Analytics Viewer, Service Usage Consumer. It has no keys.

Remove (Firebase CLI login is enough, no gcloud needed): delete the service account and the pool from
https://console.cloud.google.com/iam-admin/serviceaccounts?project=relaxify-observability and
https://console.cloud.google.com/iam-admin/workload-identity-pools?project=relaxify-observability
(a deleted pool can be restored for 30 days).

Keep the Tool Results API on: local Test Lab runs from the owner's machine also need it.

## Check it's off

- `RemoteTrigger list` shows the routine disabled (or gone).
- The next RC tag's Actions run has no `device-test` job, or it shows as skipped.
- Test Lab history shows no new runs: https://console.firebase.google.com/project/relaxify-observability/testlab/histories/
