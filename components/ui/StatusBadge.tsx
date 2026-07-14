import { Badge, type BadgeProps } from "./Badge";
import {
  DOC_STATUS_LABEL,
  DOC_STATUS_TONE,
  RECIPIENT_STATUS_LABEL,
  RECIPIENT_STATUS_TONE,
  type DocStatus,
  type RecipientStatus,
} from "@/lib/types";

type StatusBadgeProps = Omit<BadgeProps, "tone" | "children"> &
  (
    | { kind: "document"; status: DocStatus }
    | { kind: "recipient"; status: RecipientStatus }
  ) & { label?: string };

/**
 * Maps a document or recipient status to its brand tone + human label.
 * Pulls the label/tone maps from `@/lib/types` so copy stays consistent.
 * An optional `label` overrides the default English label (e.g. a localized
 * string from the i18n dictionary).
 */
export function StatusBadge({
  kind,
  status,
  dot = true,
  label,
  ...rest
}: StatusBadgeProps) {
  const { tone, label: defaultLabel } =
    kind === "document"
      ? { tone: DOC_STATUS_TONE[status], label: DOC_STATUS_LABEL[status] }
      : {
          tone: RECIPIENT_STATUS_TONE[status],
          label: RECIPIENT_STATUS_LABEL[status],
        };

  return (
    <Badge tone={tone} dot={dot} {...rest}>
      {label ?? defaultLabel}
    </Badge>
  );
}
