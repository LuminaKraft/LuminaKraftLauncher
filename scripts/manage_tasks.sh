#!/usr/bin/env bash

# Manage GitHub tasks: create draft items in a GitHub Project (Todo list)
# Usage:
#
#	./scripts/manage_tasks.sh \
#		[-f ./scripts/tasks.txt] \
#		[-o OrgOrUser] \
#		[-n 1] \
#		[-p PVT_xxxProjectId] \
#		[-a githubUser]
#
# tasks.txt format (both supported):
#
# 1) New format (recommended):
#	Title | P0|P1|P2 | Optional description
#
# 2) Legacy format:
#	High|Medium|Low | Title | Optional description
#
# Mapping: High->P0, Medium->P1, Low->P2

set -o pipefail

TASKS_FILE="./scripts/tasks.txt"
ORG="LuminaKraft"
PROJECT_NUMBER="1"
PROJECT_ID="PVT_kwDODP6cIc4BAJn-"
ASSIGNEE="kristiangarcia"

print_usage() {
	echo "Usage: $0 [-f tasks_file] [-o org_or_user] [-n project_number] [-p project_id] [-a assignee]"
}

require_cmd() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Error: required command '$1' not found in PATH" >&2
		exit 1
	fi
}

trim() {
	local s="$1"
	# shellcheck disable=SC2001
	echo "$(echo "$s" | sed -e 's/^\s\+//' -e 's/\s\+$//')"
}

get_project_id() {
	if [[ -n "$PROJECT_ID" ]]; then
		echo "$PROJECT_ID"
		return 0
	fi

	# Try without owner
	local id
	id=$(gh project view "$PROJECT_NUMBER" --format json --jq .id 2>&1) || true
	if [[ -n "$id" && "$id" != *"error"* && "$id" != *"unknown"* ]]; then
		echo "$id"
		return 0
	fi
	# Try with explicit owner
	id=$(gh project view "$PROJECT_NUMBER" --owner "$ORG" --format json --jq .id 2>&1) || true
	if [[ -n "$id" && "$id" != *"error"* && "$id" != *"unknown"* ]]; then
		echo "$id"
		return 0
	fi
	# Try with current user
	id=$(gh project view "$PROJECT_NUMBER" --owner "@me" --format json --jq .id 2>&1) || true
	if [[ -n "$id" && "$id" != *"error"* && "$id" != *"unknown"* ]]; then
		echo "$id"
		return 0
	fi

	echo "" # empty -> caller handles
}

# Globals populated by load_field_meta
STATUS_FIELD_ID=""
STATUS_TODO_ID=""
PRIORITY_FIELD_ID=""
declare -A PRIORITY_OPT_BY_NAME

load_field_meta() {
	local fields_json=""
	fields_json=$(gh project field-list "$PROJECT_NUMBER" --format json 2>&1) || true
	if [[ -z "$fields_json" || "$fields_json" == *"error"* ]]; then
		fields_json=$(gh project field-list "$PROJECT_NUMBER" --owner "$ORG" --format json 2>&1) || true
	fi
	if [[ -z "$fields_json" || "$fields_json" == *"error"* ]]; then
		fields_json=$(gh project field-list "$PROJECT_NUMBER" --owner "@me" --format json 2>&1) || true
	fi
	if [[ -z "$fields_json" || "$fields_json" == *"error"* ]]; then
		echo "Failed to list project fields for $ORG/$PROJECT_NUMBER" >&2
		echo "$fields_json" >&2
		return 1
	fi

	# Status field
	STATUS_FIELD_ID=$(echo "$fields_json" | jq -r '.fields[] | select(.name=="Status") | .id')
	STATUS_TODO_ID=$(echo "$fields_json" | jq -r '.fields[] | select(.name=="Status") | .options[] | select(.name=="Todo") | .id')
	# Priority field + options map
	PRIORITY_FIELD_ID=$(echo "$fields_json" | jq -r '.fields[] | select(.name=="Priority") | .id')
	local names ids i name id
	names=$(echo "$fields_json" | jq -r '.fields[] | select(.name=="Priority") | .options[] | .name')
	ids=$(echo "$fields_json" | jq -r '.fields[] | select(.name=="Priority") | .options[] | .id')
	# shellcheck disable=SC2207
	readarray -t names_arr <<<"$names"
	# shellcheck disable=SC2207
	readarray -t ids_arr <<<"$ids"
	for ((i=0;i<${#names_arr[@]};i++)); do
		name="${names_arr[$i]}"; id="${ids_arr[$i]}"
		PRIORITY_OPT_BY_NAME["$name"]="$id"
	done

	if [[ -z "$STATUS_FIELD_ID" || -z "$STATUS_TODO_ID" || -z "$PRIORITY_FIELD_ID" ]]; then
		echo "Could not resolve required project fields (Status/Priority)." >&2
		return 1
	fi

	return 0
}

create_draft_item() {
	local title="$1"
	local body="$2"
	local final_body
	if [[ -n "$body" ]]; then
		final_body="$body
Assignee: @$ASSIGNEE"
	else
		final_body="Assignee: @$ASSIGNEE"
	fi
	local id
	id=$(gh project item-create "$PROJECT_NUMBER" --owner "$ORG" --title "$title" --body "$final_body" --format json --jq .id 2>&1) || true
	if [[ -z "$id" || "$id" == *"error"* ]]; then
		echo ""; return 1
	fi
	echo "$id"
	return 0
}

set_item_status_todo() {
	local item_id="$1"
	gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" --field-id "$STATUS_FIELD_ID" --single-select-option-id "$STATUS_TODO_ID" >/dev/null 2>&1 || return 1
	return 0
}

set_item_priority() {
	local item_id="$1"
	local label="$2" # P0|P1|P2
	local opt_id="${PRIORITY_OPT_BY_NAME[$label]}"
	if [[ -z "$opt_id" ]]; then
		opt_id="${PRIORITY_OPT_BY_NAME[P2]}"
	fi
	gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" --field-id "$PRIORITY_FIELD_ID" --single-select-option-id "$opt_id" >/dev/null 2>&1 || return 1
	return 0
}

try_assign_item() {
	local item_id="$1"
	# Not supported currently; best-effort attempt ignored.
	local assignees_field_id
	assignees_field_id=$(gh project field-list "$PROJECT_NUMBER" --owner "$ORG" --format json 2>/dev/null | jq -r '.fields[] | select(.name=="Assignees") | .id')
	if [[ -z "$assignees_field_id" ]]; then
		return 1
	fi
	gh project item-edit --id "$item_id" --project-id "$PROJECT_ID" --field-id "$assignees_field_id" --text "$ASSIGNEE" >/dev/null 2>&1 || return 1
	return 0
}

map_priority_token() {
	local token="$1"
	case "$token" in
		High) echo "P0" ;;
		Medium) echo "P1" ;;
		Low) echo "P2" ;;
		P0|P1|P2) echo "$token" ;;
		*) echo "P2" ;;
	esac
}

process_tasks() {
	local added=()
	while IFS= read -r line || [[ -n "$line" ]]; do
		# skip blanks/comments
		[[ -z "$(trim "$line")" ]] && continue
		[[ "$(echo "$line" | sed -e 's/^\s\+//')" =~ ^# ]] && continue

		local p1 p2 p3
		IFS='|' read -r p1 p2 p3 <<<"$line"
		p1="$(trim "$p1")"; p2="$(trim "$p2")"; p3="$(trim "$p3")"

		local title desc pr
		if [[ "$p1" =~ ^(High|Medium|Low|P0|P1|P2)$ && -n "$p2" ]]; then
			# Legacy: Priority | Title | Desc
			pr="$(map_priority_token "$p1")"
			title="$p2"
			desc="$p3"
		elif [[ "$p2" =~ ^(P0|P1|P2)$ ]]; then
			# New: Title | P? | Desc
			title="$p1"
			pr="$p2"
			desc="$p3"
		else
			# Fallback: Title only
			title="$p1"
			pr="P2"
			desc="$p2 $p3"
		fi

		[[ -z "$title" ]] && continue

		echo "Creating draft item for task: $title"
		local item_id
		item_id=$(create_draft_item "$title" "$desc") || true
		if [[ -n "$item_id" ]]; then
			set_item_status_todo "$item_id" || echo "Warning: failed to set Status=Todo for item: $item_id" >&2
			set_item_priority "$item_id" "$pr" || echo "Warning: failed to set Priority for item: $item_id" >&2
			try_assign_item "$item_id" || echo "Warning: could not set Assignees on draft item (not supported)" >&2
			echo "Task added as draft in project: $title (Priority=$pr)"
			added+=("$line")
		else
			echo "Failed to create draft item: $title" >&2
		fi
	done < "$TASKS_FILE"

	# Cleanup prompt
	if (( ${#added[@]} > 0 )); then
		read -r -p "Clean tasks file by removing added tasks? (Y/n) " ans
		ans="$(echo "$ans" | tr '[:upper:]' '[:lower:]')"
		if [[ -z "$ans" || "$ans" == "y" ]]; then
			local tmp
			tmp=$(mktemp)
			# Keep blanks and comments; remove exact added lines (trimmed)
			while IFS= read -r line || [[ -n "$line" ]]; do
				local t="$(trim "$line")"
				local keep=1
				if [[ -n "$t" && ! "$t" =~ ^# ]]; then
					for a in "${added[@]}"; do
						if [[ "$t" == "$(trim "$a")" ]]; then keep=0; break; fi
					done
				fi
				if (( keep )); then echo "$line" >> "$tmp"; fi
			done < "$TASKS_FILE"
			mv "$tmp" "$TASKS_FILE"
			echo "Added tasks removed from '$TASKS_FILE'."
		else
			echo "Tasks file left unchanged."
		fi
	else
		echo "No tasks were added, file unchanged."
	fi
}

# Parse flags
while getopts ":f:o:n:p:a:h" opt; do
	case "$opt" in
		f) TASKS_FILE="$OPTARG" ;;
		o) ORG="$OPTARG" ;;
		n) PROJECT_NUMBER="$OPTARG" ;;
		p) PROJECT_ID="$OPTARG" ;;
		a) ASSIGNEE="$OPTARG" ;;
		h) print_usage; exit 0 ;;
		*) print_usage; exit 1 ;;
	esac
done

require_cmd gh
require_cmd jq

if [[ ! -f "$TASKS_FILE" ]]; then
	echo "Tasks file not found: $TASKS_FILE" >&2
	exit 1
fi

# Resolve project id if not provided
PROJECT_ID="$(get_project_id)"
if [[ -z "$PROJECT_ID" ]]; then
	echo "Failed to resolve project id. Consider passing -p PVT_... explicitly." >&2
	exit 1
fi

if ! load_field_meta; then
	exit 1
fi

process_tasks


