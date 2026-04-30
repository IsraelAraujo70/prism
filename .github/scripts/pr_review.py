#!/usr/bin/env python3
"""Run Codex CLI as a per-area PR reviewer.

Reads `.github/pr-review.yml`, computes which areas the PR diff touches,
and runs one `codex exec` invocation per affected area with a scoped diff
plus the area's rubric. Aggregates findings into a single JSON file that
the workflow uses to post a PR comment.
"""
import argparse
import fnmatch
import json
import subprocess
import sys
import time
from pathlib import Path

import yaml


def changed_files(base_sha: str, head_sha: str) -> list[str]:
    out = subprocess.check_output(
        ["git", "diff", "--name-only", f"{base_sha}...{head_sha}"],
        text=True,
    )
    return [line for line in out.splitlines() if line.strip()]


def match_area(area: dict, files: list[str]) -> list[str]:
    patterns = area.get("paths", []) or []
    matched: list[str] = []
    for f in files:
        for pat in patterns:
            if fnmatch.fnmatch(f, pat):
                matched.append(f)
                break
    return matched


def scoped_diff(base_sha: str, head_sha: str, files: list[str]) -> str:
    result = subprocess.run(
        ["git", "diff", f"{base_sha}...{head_sha}", "--"] + files,
        capture_output=True, text=True, check=True,
    )
    return result.stdout


def build_prompt(area: dict, diff_text: str, files: list[str]) -> str:
    file_list = "\n".join(f"- {f}" for f in files)
    return f"""You are reviewing a pull request, scoped to the area: {area.get('label', area['id'])}.

Files in this area touched by the PR:
{file_list}

Apply the following rubric. Each rule is a hard requirement unless the diff
includes an explicit justification.

{area['rubric']}

Output format (plain text, no markdown headers):
- Line 1: VERDICT: PASS or VERDICT: CONCERNS
- If CONCERNS, follow with a numbered list. Each item:
    N. <file_path>:<line> — <description>. Suggestion: <action>.
- Cite a specific line in the diff for every concern. Do not invent issues.
- Do not flag style or lint issues unless the rubric explicitly demands it.
- Be concise but specific. No filler.

--- DIFF (scoped to this area) ---
{diff_text}
--- END DIFF ---
"""


def run_codex(prompt: str, reasoning_effort: str, output_file: Path) -> tuple[int, str, str]:
    if output_file.exists():
        output_file.unlink()
    cmd = [
        "codex", "exec",
        "--sandbox", "read-only",
        "--skip-git-repo-check",
        "-c", f"model_reasoning_effort={reasoning_effort}",
        "--output-last-message", str(output_file),
        prompt,
    ]
    started = time.time()
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    elapsed = time.time() - started
    final = output_file.read_text().strip() if output_file.exists() else ""
    log = ((result.stdout or "") + (result.stderr or "")).strip()
    print(f"  codex exec finished in {elapsed:.1f}s, rc={result.returncode}, "
          f"final_len={len(final)}, log_len={len(log)}", flush=True)
    return result.returncode, final, log


def parse_verdict(output: str) -> str:
    for line in output.splitlines():
        s = line.strip().upper()
        if s.startswith("VERDICT:"):
            v = s.split(":", 1)[1].strip()
            if v.startswith("PASS"):
                return "pass"
            if v.startswith("CONCERN"):
                return "concerns"
    return "unknown"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--config", default=".github/pr-review.yml")
    p.add_argument("--base-sha", required=True)
    p.add_argument("--head-sha", required=True)
    p.add_argument("--out", default="/tmp/pr-review-results.json")
    args = p.parse_args()

    config = yaml.safe_load(Path(args.config).read_text())
    defaults = config.get("defaults", {}) or {}
    reasoning = defaults.get("reasoning_effort", "medium")
    max_diff_chars = int(defaults.get("max_diff_chars_per_area", 60_000))

    files = changed_files(args.base_sha, args.head_sha)
    print(f"Changed files ({len(files)}):", flush=True)
    for f in files:
        print(f"  {f}", flush=True)

    results = []
    for area in config.get("areas", []) or []:
        matched = match_area(area, files)
        if not matched:
            print(f"\n[{area['id']}] no matching files, skipping", flush=True)
            results.append({
                "area": area["id"],
                "label": area.get("label", area["id"]),
                "skipped": True,
                "files": [],
                "verdict": "skipped",
                "output": "",
            })
            continue

        print(f"\n[{area['id']}] {len(matched)} matching file(s):", flush=True)
        for f in matched:
            print(f"  {f}", flush=True)

        diff_text = scoped_diff(args.base_sha, args.head_sha, matched)
        truncated = False
        if len(diff_text) > max_diff_chars:
            diff_text = diff_text[:max_diff_chars] + "\n\n[... diff truncated ...]"
            truncated = True

        prompt = build_prompt(area, diff_text, matched)
        out_path = Path(f"/tmp/codex-final-{area['id']}.txt")
        rc, final, log = run_codex(prompt, reasoning, out_path)

        results.append({
            "area": area["id"],
            "label": area.get("label", area["id"]),
            "skipped": False,
            "files": matched,
            "diff_truncated": truncated,
            "ok": rc == 0,
            "verdict": parse_verdict(final) if rc == 0 else "error",
            "output": final,
            "log_tail": log[-2000:] if rc != 0 else "",
        })

    Path(args.out).write_text(json.dumps(results, indent=2))
    print(f"\nWrote {len(results)} area result(s) to {args.out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
