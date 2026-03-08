#!/usr/bin/env python3
"""Azure DevOps Boards helper for backlog item create/query/update flows."""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
from html import escape
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib import error, parse, request

DEFAULT_API_VERSION = "7.1"
WIQL_BATCH_LIMIT = 200

ITEM_TYPE_ALIASES = {
    "feature": "Feature",
    "user story": "User Story",
    "user-story": "User Story",
    "story": "User Story",
    "bug": "Bug",
}

RELATION_ALIASES = {
    "parent": "System.LinkTypes.Hierarchy-Reverse",
    "child": "System.LinkTypes.Hierarchy-Forward",
    "related": "System.LinkTypes.Related",
}

SECTION_HEADINGS = (
    "Problem",
    "User Story",
    "Acceptance Criteria",
    "Acceptance Criteria (Given/When/Then)",
    "Scope",
    "Notes",
    "Dependencies",
    "Non-goals",
    "Rollout/flags",
)
SECTION_HEADINGS_LOWER = {heading.lower() for heading in SECTION_HEADINGS}


def has_html_markup(value: str) -> bool:
    return bool(re.search(r"</?[a-zA-Z][^>]*>", value))


def normalize_story_text(value: str) -> str:
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return text

    for heading in SECTION_HEADINGS:
        # Convert "Heading - details" to markdown-like heading + bullet.
        text = re.sub(
            rf"(?i)\b{re.escape(heading)}\s*-\s*",
            f"{heading}\n- ",
            text,
        )

    # If bullets were inlined into one sentence, split them out for readability.
    text = re.sub(r"\s+-\s+(?=Given\b)", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(
        r"\s+-\s+(?=(Dependencies|Non-goals|Rollout/flags)\s*:)",
        "\n- ",
        text,
        flags=re.IGNORECASE,
    )

    heading_pattern = "|".join(re.escape(h) for h in SECTION_HEADINGS)
    text = re.sub(rf"(?<!\n)(?<!-)\s+(?=({heading_pattern})\b)", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def is_heading_line(line: str) -> bool:
    candidate = line.strip().rstrip(":")
    if not candidate:
        return False
    if candidate in {"-", "*"}:
        return False
    if candidate.lower() in SECTION_HEADINGS_LOWER:
        return True
    if len(candidate) > 60 or len(candidate.split()) > 5:
        return False
    if re.search(r"[.!?]", candidate):
        return False
    return bool(re.match(r"^[A-Za-z0-9/()'&\s-]+$", candidate))


def to_ado_rich_text(value: str) -> str:
    if has_html_markup(value):
        return value

    text = normalize_story_text(value)
    lines = [line.strip() for line in text.split("\n")]
    out: List[str] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue

        if is_heading_line(line):
            out.append(f"<h3>{escape(line.rstrip(':').strip())}</h3>")
            i += 1
            continue

        if re.match(r"^[-*]\s+", line):
            items: List[str] = []
            while i < len(lines):
                m = re.match(r"^[-*]\s+(.*)$", lines[i])
                if not m:
                    break
                items.append(f"<li>{escape(m.group(1).strip())}</li>")
                i += 1
            out.append("<ul>" + "".join(items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+", line):
            items = []
            while i < len(lines):
                m = re.match(r"^\d+\.\s+(.*)$", lines[i])
                if not m:
                    break
                items.append(f"<li>{escape(m.group(1).strip())}</li>")
                i += 1
            out.append("<ol>" + "".join(items) + "</ol>")
            continue

        paragraph = [line]
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if not nxt:
                i += 1
                break
            if is_heading_line(nxt) or re.match(r"^[-*]\s+|^\d+\.\s+", nxt):
                break
            paragraph.append(nxt)
            i += 1
        out.append(f"<p>{escape(' '.join(paragraph))}</p>")

    return "\n".join(out)


class AdoBoardsError(RuntimeError):
    """Domain exception for user-facing failures."""


def print_json(payload: Dict[str, Any]) -> None:
    print(json.dumps(payload, indent=2, sort_keys=False))


def normalize_org_url(org: str) -> str:
    org = org.strip()
    if not org:
        raise AdoBoardsError("Organization is required.")

    if org.startswith("http://") or org.startswith("https://"):
        return org.rstrip("/")

    return f"https://dev.azure.com/{org.strip('/')}"


def get_pat(pat_arg: Optional[str]) -> str:
    pat = (pat_arg or os.environ.get("AZDO_PAT", "")).strip()
    if not pat:
        raise AdoBoardsError("PAT not provided. Set AZDO_PAT or pass --pat.")
    return pat


def escape_json_pointer(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


def field_path(field_name: str) -> str:
    return f"/fields/{escape_json_pointer(field_name)}"


def auth_header_value(pat: str) -> str:
    # ADO Basic auth uses empty username and PAT as password: ":<PAT>"
    raw = f":{pat}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def build_url(org_url: str, path: str, api_version: str, params: Optional[Dict[str, Any]] = None) -> str:
    query: Dict[str, Any] = dict(params or {})
    query["api-version"] = api_version
    query_string = parse.urlencode(query, doseq=True)
    return f"{org_url}/{path.lstrip('/')}?{query_string}"


def azure_request(
    *,
    method: str,
    org_url: str,
    path: str,
    pat: str,
    api_version: str,
    timeout: int,
    body: Optional[Any] = None,
    content_type: str = "application/json",
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    url = build_url(org_url, path, api_version, params=params)
    payload_bytes = None
    if body is not None:
        payload_bytes = json.dumps(body).encode("utf-8")

    req = request.Request(url=url, data=payload_bytes, method=method.upper())
    req.add_header("Authorization", auth_header_value(pat))
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", content_type)

    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)
    except error.HTTPError as exc:
        raw_err = exc.read().decode("utf-8", errors="replace")
        detail = raw_err
        try:
            parsed = json.loads(raw_err)
            detail = parsed.get("message") or parsed.get("error", {}).get("message") or raw_err
        except json.JSONDecodeError:
            pass
        raise AdoBoardsError(f"Azure DevOps request failed ({exc.code} {exc.reason}): {detail}") from exc
    except error.URLError as exc:
        raise AdoBoardsError(f"Azure DevOps request failed: {exc.reason}") from exc


def item_url(org_url: str, project: str, work_item_id: int) -> str:
    return f"{org_url}/{project}/_apis/wit/workItems/{work_item_id}"


def parse_work_item_id_from_url(url: str) -> Optional[int]:
    match = re.search(r"/workItems/(\d+)", url, re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1))


def normalize_work_item(work_item: Dict[str, Any]) -> Dict[str, Any]:
    fields = work_item.get("fields", {})

    assigned = fields.get("System.AssignedTo")
    if isinstance(assigned, dict):
        assigned_to = assigned.get("displayName") or assigned.get("uniqueName")
    else:
        assigned_to = assigned

    relations_out = []
    for relation in work_item.get("relations", []) or []:
        relation_url = relation.get("url", "")
        relations_out.append(
            {
                "rel": relation.get("rel"),
                "url": relation_url,
                "target_id": parse_work_item_id_from_url(relation_url),
                "attributes": relation.get("attributes", {}),
            }
        )

    return {
        "id": work_item.get("id"),
        "url": work_item.get("url"),
        "type": fields.get("System.WorkItemType"),
        "title": fields.get("System.Title"),
        "state": fields.get("System.State"),
        "reason": fields.get("System.Reason"),
        "assigned_to": assigned_to,
        "tags": fields.get("System.Tags"),
        "area_path": fields.get("System.AreaPath"),
        "iteration_path": fields.get("System.IterationPath"),
        "description": fields.get("System.Description"),
        "acceptance_criteria": fields.get("Microsoft.VSTS.Common.AcceptanceCriteria"),
        "relations": relations_out,
    }


def parse_tags(value: str) -> str:
    parts = [segment.strip() for segment in re.split(r"[;,]", value) if segment.strip()]
    deduped: List[str] = []
    seen = set()
    for part in parts:
        lowered = part.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(part)
    return "; ".join(deduped)


def parse_custom_fields(pairs: Sequence[str]) -> Dict[str, str]:
    parsed: Dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            raise AdoBoardsError(f"Invalid --field value '{pair}'. Use Field.Name=value format.")
        key, value = pair.split("=", 1)
        key = key.strip()
        if not key:
            raise AdoBoardsError(f"Invalid --field value '{pair}'. Field name cannot be empty.")
        parsed[key] = value
    return parsed


def normalize_item_type(raw: str) -> str:
    canonical = ITEM_TYPE_ALIASES.get(raw.strip().lower())
    if not canonical:
        allowed = ", ".join(sorted(set(ITEM_TYPE_ALIASES.values())))
        raise AdoBoardsError(f"Unsupported item type '{raw}'. Allowed: {allowed}.")
    return canonical


def normalize_relation_kind(raw: str) -> str:
    canonical = RELATION_ALIASES.get(raw.strip().lower())
    if not canonical:
        allowed = ", ".join(sorted(RELATION_ALIASES.keys()))
        raise AdoBoardsError(f"Unsupported relation kind '{raw}'. Allowed: {allowed}.")
    return canonical


def target_to_url(target: str, org_url: str, project: str) -> str:
    target = target.strip()
    if not target:
        raise AdoBoardsError("Relation target cannot be empty.")
    if target.startswith("http://") or target.startswith("https://"):
        return target
    if target.isdigit():
        return item_url(org_url, project, int(target))
    raise AdoBoardsError(
        f"Unsupported relation target '{target}'. Use a numeric work item id or full URL."
    )


def parse_relation_spec(spec: str) -> Tuple[str, str]:
    if ":" not in spec:
        raise AdoBoardsError(
            f"Invalid relation spec '{spec}'. Use relation:target, for example parent:123."
        )
    kind_raw, target = spec.split(":", 1)
    kind = normalize_relation_kind(kind_raw)
    return kind, target


def build_field_ops(args: argparse.Namespace, *, include_title: bool) -> List[Dict[str, Any]]:
    ops: List[Dict[str, Any]] = []

    if include_title or args.title:
        if not args.title:
            raise AdoBoardsError("--title is required for create.")
        ops.append({"op": "add", "path": field_path("System.Title"), "value": args.title})

    if args.description is not None:
        description_value = (
            args.description if args.no_rich_text_format else to_ado_rich_text(args.description)
        )
        ops.append(
            {"op": "add", "path": field_path("System.Description"), "value": description_value}
        )

    if args.acceptance_criteria is not None:
        ac_value = (
            args.acceptance_criteria
            if args.no_rich_text_format
            else to_ado_rich_text(args.acceptance_criteria)
        )
        ops.append(
            {
                "op": "add",
                "path": field_path("Microsoft.VSTS.Common.AcceptanceCriteria"),
                "value": ac_value,
            }
        )

    if args.state is not None:
        ops.append({"op": "add", "path": field_path("System.State"), "value": args.state})

    if args.reason is not None:
        ops.append({"op": "add", "path": field_path("System.Reason"), "value": args.reason})

    if args.tags is not None:
        ops.append({"op": "add", "path": field_path("System.Tags"), "value": parse_tags(args.tags)})

    if args.area_path is not None:
        ops.append({"op": "add", "path": field_path("System.AreaPath"), "value": args.area_path})

    if args.iteration_path is not None:
        ops.append(
            {
                "op": "add",
                "path": field_path("System.IterationPath"),
                "value": args.iteration_path,
            }
        )

    for field_name, value in parse_custom_fields(args.field).items():
        ops.append({"op": "add", "path": field_path(field_name), "value": value})

    return ops


def build_add_relation_ops(args: argparse.Namespace, org_url: str, project: str) -> List[Dict[str, Any]]:
    ops: List[Dict[str, Any]] = []

    if args.parent_id is not None:
        ops.append(
            {
                "op": "add",
                "path": "/relations/-",
                "value": {
                    "rel": RELATION_ALIASES["parent"],
                    "url": item_url(org_url, project, args.parent_id),
                },
            }
        )

    for child_id in args.child_id:
        ops.append(
            {
                "op": "add",
                "path": "/relations/-",
                "value": {
                    "rel": RELATION_ALIASES["child"],
                    "url": item_url(org_url, project, child_id),
                },
            }
        )

    for related_id in args.related_id:
        ops.append(
            {
                "op": "add",
                "path": "/relations/-",
                "value": {
                    "rel": RELATION_ALIASES["related"],
                    "url": item_url(org_url, project, related_id),
                },
            }
        )

    for spec in args.add_link:
        relation_kind, target = parse_relation_spec(spec)
        ops.append(
            {
                "op": "add",
                "path": "/relations/-",
                "value": {"rel": relation_kind, "url": target_to_url(target, org_url, project)},
            }
        )

    return ops


def remove_specs_to_set(args: argparse.Namespace, org_url: str, project: str) -> List[Tuple[str, Optional[int], str]]:
    target_specs: List[Tuple[str, Optional[int], str]] = []
    for spec in args.remove_link:
        relation_kind, target = parse_relation_spec(spec)
        target_url = target_to_url(target, org_url, project)
        target_specs.append((relation_kind, parse_work_item_id_from_url(target_url), target_url))
    return target_specs


def build_remove_relation_ops(
    current_item: Dict[str, Any],
    remove_specs: Sequence[Tuple[str, Optional[int], str]],
) -> List[Dict[str, Any]]:
    if not remove_specs:
        return []

    indices_to_remove: List[int] = []
    relations = current_item.get("relations", []) or []

    for idx, relation in enumerate(relations):
        relation_kind = relation.get("rel")
        relation_url = relation.get("url", "")
        relation_target_id = parse_work_item_id_from_url(relation_url)

        for expected_kind, expected_target_id, expected_url in remove_specs:
            if relation_kind != expected_kind:
                continue
            if expected_target_id is not None and relation_target_id == expected_target_id:
                indices_to_remove.append(idx)
                break
            if relation_url == expected_url:
                indices_to_remove.append(idx)
                break

    ops: List[Dict[str, Any]] = []
    for idx in sorted(set(indices_to_remove), reverse=True):
        ops.append({"op": "remove", "path": f"/relations/{idx}"})
    return ops


def ensure_apply_confirmation(args: argparse.Namespace) -> None:
    if args.apply and args.confirm != "YES":
        raise AdoBoardsError("Refusing to apply changes without --confirm YES.")


def fetch_work_item(
    *,
    org_url: str,
    project: str,
    pat: str,
    api_version: str,
    timeout: int,
    work_item_id: int,
    expand_relations: bool,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if expand_relations:
        params["$expand"] = "relations"
    return azure_request(
        method="GET",
        org_url=org_url,
        path=f"/{project}/_apis/wit/workitems/{work_item_id}",
        pat=pat,
        api_version=api_version,
        timeout=timeout,
        params=params,
    )


def batched(values: Sequence[int], size: int) -> Iterable[Sequence[int]]:
    for i in range(0, len(values), size):
        yield values[i : i + size]


def fetch_work_items(
    *,
    org_url: str,
    project: str,
    pat: str,
    api_version: str,
    timeout: int,
    ids: Sequence[int],
    expand_relations: bool,
) -> List[Dict[str, Any]]:
    if not ids:
        return []

    all_items: List[Dict[str, Any]] = []
    for batch in batched(ids, WIQL_BATCH_LIMIT):
        params: Dict[str, Any] = {"ids": ",".join(str(v) for v in batch)}
        if expand_relations:
            params["$expand"] = "relations"

        response = azure_request(
            method="GET",
            org_url=org_url,
            path=f"/{project}/_apis/wit/workitems",
            pat=pat,
            api_version=api_version,
            timeout=timeout,
            params=params,
        )
        all_items.extend(response.get("value", []))

    return all_items


def handle_get(args: argparse.Namespace) -> None:
    pat = get_pat(args.pat)
    org_url = normalize_org_url(args.org)

    item = fetch_work_item(
        org_url=org_url,
        project=args.project,
        pat=pat,
        api_version=args.api_version,
        timeout=args.timeout,
        work_item_id=args.work_item_id,
        expand_relations=args.expand_relations,
    )

    out = {
        "operation": "get",
        "work_item": normalize_work_item(item),
    }
    if args.raw:
        out["raw"] = item
    print_json(out)


def handle_query(args: argparse.Namespace) -> None:
    pat = get_pat(args.pat)
    org_url = normalize_org_url(args.org)

    wiql_resp = azure_request(
        method="POST",
        org_url=org_url,
        path=f"/{args.project}/_apis/wit/wiql",
        pat=pat,
        api_version=args.api_version,
        timeout=args.timeout,
        body={"query": args.wiql},
    )

    raw_ids = [entry.get("id") for entry in wiql_resp.get("workItems", []) if entry.get("id")]
    truncated_ids = raw_ids[: args.top]

    items = fetch_work_items(
        org_url=org_url,
        project=args.project,
        pat=pat,
        api_version=args.api_version,
        timeout=args.timeout,
        ids=truncated_ids,
        expand_relations=args.expand_relations,
    )

    output = {
        "operation": "query",
        "query": {
            "wiql": args.wiql,
            "count_total": len(raw_ids),
            "count_returned": len(items),
            "top": args.top,
            "columns": [col.get("referenceName") for col in wiql_resp.get("columns", [])],
        },
        "work_items": [normalize_work_item(item) for item in items],
    }

    if args.raw:
        output["raw_query"] = wiql_resp
        output["raw_work_items"] = items

    print_json(output)


def create_preview_payload(
    *,
    org_url: str,
    project: str,
    api_version: str,
    item_type: str,
    patch_ops: List[Dict[str, Any]],
) -> Dict[str, Any]:
    endpoint_path = f"/{project}/_apis/wit/workitems/${parse.quote(item_type)}"
    return {
        "mode": "preview",
        "operation": "create",
        "item_type": item_type,
        "api_method": "POST",
        "api_url": build_url(org_url, endpoint_path, api_version),
        "patch": patch_ops,
    }


def update_preview_payload(
    *,
    org_url: str,
    project: str,
    api_version: str,
    work_item_id: int,
    patch_ops: List[Dict[str, Any]],
) -> Dict[str, Any]:
    endpoint_path = f"/{project}/_apis/wit/workitems/{work_item_id}"
    return {
        "mode": "preview",
        "operation": "update",
        "work_item_id": work_item_id,
        "api_method": "PATCH",
        "api_url": build_url(org_url, endpoint_path, api_version),
        "patch": patch_ops,
    }


def handle_create(args: argparse.Namespace) -> None:
    org_url = normalize_org_url(args.org)
    item_type = normalize_item_type(args.item_type)

    patch_ops = build_field_ops(args, include_title=True)
    patch_ops.extend(build_add_relation_ops(args, org_url, args.project))

    ensure_apply_confirmation(args)

    if not args.apply:
        print_json(
            create_preview_payload(
                org_url=org_url,
                project=args.project,
                api_version=args.api_version,
                item_type=item_type,
                patch_ops=patch_ops,
            )
        )
        return

    pat = get_pat(args.pat)
    created = azure_request(
        method="POST",
        org_url=org_url,
        path=f"/{args.project}/_apis/wit/workitems/${parse.quote(item_type)}",
        pat=pat,
        api_version=args.api_version,
        timeout=args.timeout,
        body=patch_ops,
        content_type="application/json-patch+json",
    )

    output = {
        "mode": "applied",
        "operation": "create",
        "work_item": normalize_work_item(created),
    }
    if args.raw:
        output["raw"] = created
    print_json(output)


def handle_update(args: argparse.Namespace) -> None:
    org_url = normalize_org_url(args.org)
    ensure_apply_confirmation(args)

    patch_ops = build_field_ops(args, include_title=False)
    patch_ops.extend(build_add_relation_ops(args, org_url, args.project))

    remove_specs = remove_specs_to_set(args, org_url, args.project)
    if remove_specs:
        pat = get_pat(args.pat)
        current = fetch_work_item(
            org_url=org_url,
            project=args.project,
            pat=pat,
            api_version=args.api_version,
            timeout=args.timeout,
            work_item_id=args.work_item_id,
            expand_relations=True,
        )
        patch_ops.extend(build_remove_relation_ops(current, remove_specs))

    if not patch_ops:
        raise AdoBoardsError("No changes provided. Supply fields and/or relation operations to update.")

    if not args.apply:
        print_json(
            update_preview_payload(
                org_url=org_url,
                project=args.project,
                api_version=args.api_version,
                work_item_id=args.work_item_id,
                patch_ops=patch_ops,
            )
        )
        return

    pat = get_pat(args.pat)
    updated = azure_request(
        method="PATCH",
        org_url=org_url,
        path=f"/{args.project}/_apis/wit/workitems/{args.work_item_id}",
        pat=pat,
        api_version=args.api_version,
        timeout=args.timeout,
        body=patch_ops,
        content_type="application/json-patch+json",
    )

    output = {
        "mode": "applied",
        "operation": "update",
        "work_item": normalize_work_item(updated),
    }
    if args.raw:
        output["raw"] = updated
    print_json(output)


def add_shared_connection_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--org", required=True, help="Azure DevOps organization name or URL")
    parser.add_argument("--project", required=True, help="Azure DevOps project name")
    parser.add_argument("--pat", default=None, help="PAT override (defaults to AZDO_PAT env var)")
    parser.add_argument("--api-version", default=DEFAULT_API_VERSION, help="ADO REST API version")
    parser.add_argument("--timeout", type=int, default=30, help="HTTP timeout in seconds")
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Include raw API responses in output when available",
    )


def add_write_fields_args(parser: argparse.ArgumentParser, *, create_mode: bool) -> None:
    if create_mode:
        parser.add_argument("--item-type", required=True, help="Feature, User Story, or Bug")
        parser.add_argument("--title", required=True, help="Work item title")
    else:
        parser.add_argument("--title", default=None, help="Work item title")

    parser.add_argument("--description", default=None, help="System.Description value")
    parser.add_argument(
        "--acceptance-criteria",
        default=None,
        help="Microsoft.VSTS.Common.AcceptanceCriteria value",
    )
    parser.add_argument(
        "--no-rich-text-format",
        action="store_true",
        help="Do not auto-format plain text description/acceptance criteria into HTML rich text.",
    )
    parser.add_argument("--state", default=None, help="System.State value")
    parser.add_argument("--reason", default=None, help="System.Reason value")
    parser.add_argument("--tags", default=None, help="Tags separated by ';' or ','")
    parser.add_argument("--area-path", default=None, help="System.AreaPath value")
    parser.add_argument("--iteration-path", default=None, help="System.IterationPath value")
    parser.add_argument(
        "--field",
        action="append",
        default=[],
        help="Custom field assignment in Field.Name=value format; repeatable",
    )

    parser.add_argument("--parent-id", type=int, default=None, help="Add parent relation to id")
    parser.add_argument(
        "--child-id",
        type=int,
        action="append",
        default=[],
        help="Add child relation to id; repeatable",
    )
    parser.add_argument(
        "--related-id",
        type=int,
        action="append",
        default=[],
        help="Add related relation to id; repeatable",
    )
    parser.add_argument(
        "--add-link",
        action="append",
        default=[],
        help="Add relation in relation:target format, e.g. parent:123 or related:https://...",
    )

    if not create_mode:
        parser.add_argument(
            "--remove-link",
            action="append",
            default=[],
            help="Remove relation in relation:target format, e.g. child:456",
        )

    parser.add_argument("--apply", action="store_true", help="Apply patch. Without this, print preview.")
    parser.add_argument(
        "--confirm",
        default="",
        help="Required as --confirm YES when using --apply",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create, query, and update Azure DevOps Boards backlog work items."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    get_parser = subparsers.add_parser("get", help="Read one work item")
    add_shared_connection_args(get_parser)
    get_parser.add_argument("work_item_id", type=int, help="Work item id")
    get_parser.add_argument(
        "--expand-relations",
        action="store_true",
        help="Request relation data for the work item",
    )
    get_parser.set_defaults(handler=handle_get)

    query_parser = subparsers.add_parser("query", help="Run WIQL and fetch matching work items")
    add_shared_connection_args(query_parser)
    query_parser.add_argument("--wiql", required=True, help="WIQL query string")
    query_parser.add_argument("--top", type=int, default=50, help="Max items to hydrate")
    query_parser.add_argument(
        "--expand-relations",
        action="store_true",
        help="Expand relations when hydrating WIQL results",
    )
    query_parser.set_defaults(handler=handle_query)

    create_parser = subparsers.add_parser("create", help="Preview or create a backlog work item")
    add_shared_connection_args(create_parser)
    add_write_fields_args(create_parser, create_mode=True)
    create_parser.set_defaults(handler=handle_create)

    update_parser = subparsers.add_parser("update", help="Preview or update an existing work item")
    add_shared_connection_args(update_parser)
    update_parser.add_argument("work_item_id", type=int, help="Work item id to update")
    add_write_fields_args(update_parser, create_mode=False)
    update_parser.set_defaults(handler=handle_update)

    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        args.handler(args)
        return 0
    except AdoBoardsError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
