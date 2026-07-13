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
  );

/**
 * Maps a document or recipient status to its brand tone + human label.
 * Pulls the label/tone maps from `@/lib/types` so copy stays consistent.
 */
export function StatusBadge({ kind, status, dot = true, ...rest }: StatusBadgeProps) {
  const { tone, label } =
    kind === "document"
      ? { tone: DOC_STATUS_TONE[status], label: DOC_STATUS_LABEL[status] }
      : {
          tone: RECIPIENT_STATUS_TONE[status],
          label: RECIPIENT_STATUS_LABEL[status],
        };

  return (
    <Badge tone={tone} dot={dot} {...rest}>
      {label}
    </Badge>
  );
}
