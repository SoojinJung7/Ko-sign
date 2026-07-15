import { groupIsRequired, groupSatisfied } from "@/lib/types";
import type { FieldValue, SignerField, SignerGroup } from "./types";

/**
 * What the signer still has to do, as one ordered list.
 *
 * A lone field is its own requirement, but a checkbox group is a single
 * requirement covering all of its boxes — "tick one of these five" is one
 * decision, not five. Keeping that in one place means the progress ring, the
 * "next field" jump, the field styling, and the submit gate can't drift apart.
 * The server re-checks all of it in the submit route; this is guidance only.
 */
export type Requirement =
  | { kind: "field"; id: string; field: SignerField }
  | { kind: "group"; id: string; group: SignerGroup; members: SignerField[] };

export function isChecked(value: FieldValue | undefined): boolean {
  return (value?.value ?? "").toLowerCase() === "true";
}

export function fieldHasValue(
  field: SignerField,
  value: FieldValue | undefined,
): boolean {
  if (!value) return false;
  switch (field.type) {
    case "signature":
    case "initials":
      return Boolean(value.imageData || (value.value && value.value.trim()));
    case "checkbox":
      return isChecked(value);
    default:
      return Boolean(value.value && value.value.trim());
  }
}

/**
 * Build the requirement list. `fields` is expected in document order (page, then
 * top-to-bottom); each group takes the position of its first member, so jumping
 * to the "next" requirement walks the page the way the signer reads it.
 */
export function buildRequirements(
  fields: SignerField[],
  groups: SignerGroup[],
): Requirement[] {
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const requirements: Requirement[] = [];
  const seenGroups = new Set<string>();

  for (const field of fields) {
    const group = field.groupId ? groupById.get(field.groupId) : undefined;
    if (!group) {
      requirements.push({ kind: "field", id: field.id, field });
      continue;
    }
    if (seenGroups.has(group.id)) continue;
    seenGroups.add(group.id);
    requirements.push({
      kind: "group",
      id: group.id,
      group,
      members: fields.filter((f) => f.groupId === group.id),
    });
  }

  // A group whose members were all deleted would otherwise be invisible here,
  // and an unsatisfiable min would strand the signer with nothing to click.
  for (const group of groups) {
    if (!seenGroups.has(group.id)) {
      requirements.push({ kind: "group", id: group.id, group, members: [] });
    }
  }

  return requirements;
}

export function requirementIsRequired(req: Requirement): boolean {
  return req.kind === "field" ? req.field.required : groupIsRequired(req.group);
}

export function checkedCount(
  members: SignerField[],
  values: Record<string, FieldValue>,
): number {
  return members.filter((m) => isChecked(values[m.id])).length;
}

export function requirementDone(
  req: Requirement,
  values: Record<string, FieldValue>,
): boolean {
  if (req.kind === "field") return fieldHasValue(req.field, values[req.field.id]);
  return groupSatisfied(checkedCount(req.members, values), req.group);
}
