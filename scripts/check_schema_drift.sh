#!/usr/bin/env bash
# Release gate: does the code query anything the schema does not have?
#
# WHY THIS IS A SCRIPT AND NOT JUST A TEST
# The round-4 sync audit graded A.02 Fail — "no mechanical gate blocks release
# when the deployed schema lags the app" — and specifically required a check
# that counts FIELDS, not records. Two live faults proved the point: a route
# queried `medications.patient_id` on a table without that column, and another
# queried `family_member_id` where the column is `rated_by`. Both are
# field-level, so any record-level or table-level check would have passed them
# straight through.
#
# `src/__tests__/schema-conformance.test.ts` is that check. It exists as a
# jest test so it runs with the suite — but a test only gates a release if
# something runs it before the release, and this project's CI has never
# executed a step. So the same check is exposed here as a standalone,
# zero-dependency command that a human or a deploy script can run directly and
# read the exit code of.
#
#   ./scripts/check_schema_drift.sh
#
# Exit 0 = code and migrations agree. Exit 1 = they do not; do NOT deploy.
#
# It needs no database and no network. That matters: the reason the original
# drift went unnoticed for so long is that every check capable of catching it
# required infrastructure nobody had.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d functions/node_modules ]; then
  echo "✗ functions/node_modules missing — run 'npm ci' in functions/ first" >&2
  exit 1
fi

echo "Checking route queries against sql/*.sql …"
cd functions

if npx --no-install jest src/__tests__/schema-conformance.test.ts \
      --silent --ci >/tmp/schema_drift.log 2>&1; then
  echo "✓ No schema drift — every table and column the routes query exists."
  exit 0
fi

echo "" >&2
echo "✗ SCHEMA DRIFT — the code references something the migrations do not create." >&2
echo "" >&2
# Surface just the offending identifiers, not the whole jest dump.
grep -E '^\s+\+\s+"' /tmp/schema_drift.log | sed 's/^ *+ */  /' >&2 || \
  tail -30 /tmp/schema_drift.log >&2
echo "" >&2
echo "MySQL rejects an unknown column outright, so each line above is a route" >&2
echo "that will 500 on first contact. Either fix the query or add a migration." >&2
echo "Full output: /tmp/schema_drift.log" >&2
exit 1
