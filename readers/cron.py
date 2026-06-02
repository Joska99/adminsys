"""Cron reader: parses cron/jobs.json for the agent root AND each sub-profile.

Hermes stores cron jobs at <agent>/cron/jobs.json (the "main" profile) and at
<agent>/profiles/<name>/cron/jobs.json (sub-profiles). All are aggregated; each
job is tagged with its profile. Hermes already stores a human schedule in
`schedule_display`, so no cron-string parsing is needed.
"""

import json
import os
import re

RUN_RE = re.compile(r"^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.md$")


def _runs(cron_dir, job_id, limit=30):
    """List run-report filenames in cron/output/<job_id>/ (newest first)."""
    if not job_id:
        return [], 0
    d = os.path.join(cron_dir, "output", str(job_id))
    try:
        files = [f for f in os.listdir(d) if RUN_RE.match(f)]
    except OSError:
        return [], 0
    files.sort(reverse=True)  # filename sorts chronologically
    return files[:limit], len(files)


def _load(path, profile):
    """Return a list of normalized jobs from one jobs.json, or []."""
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return []
    cron_dir = os.path.dirname(path)
    jobs = []
    for job in data.get("jobs", []):
        if not isinstance(job, dict):
            continue
        runs, run_count = _runs(cron_dir, job.get("id"))
        jobs.append({
            "profile": profile,
            "id": job.get("id"),
            "name": job.get("name"),
            "runs": runs,
            "run_count": run_count,
            "schedule": job.get("schedule_display")
            or (job.get("schedule") or {}).get("display"),
            "skill": job.get("skill"),
            "model": job.get("model"),
            "enabled": job.get("enabled"),
            "next_run_at": job.get("next_run_at"),
            "last_run_at": job.get("last_run_at"),
            "last_status": job.get("last_status"),
            "last_error": job.get("last_error"),
        })
    return jobs


def read(agent_path):
    jobs = _load(os.path.join(agent_path, "cron", "jobs.json"), "main")

    profiles_dir = os.path.join(agent_path, "profiles")
    try:
        if os.path.isdir(profiles_dir):
            for name in sorted(os.listdir(profiles_dir)):
                sub = os.path.join(profiles_dir, name)
                if os.path.isdir(sub) and not name.startswith("."):
                    jobs.extend(_load(os.path.join(sub, "cron", "jobs.json"), name))
    except OSError as exc:
        return {"available": False, "error": str(exc)}

    failed = sum(
        1 for j in jobs
        if (j.get("last_status") or "").lower() in ("failed", "error", "crashed")
        or j.get("last_error")
    )
    return {"available": True, "jobs": jobs, "failed": failed}
