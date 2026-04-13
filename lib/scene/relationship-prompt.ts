export type RelationshipPromptObject = {
  name?: string;
  partRole?: string;
  parentId?: string;
  px?: number;
  py?: number;
  pz?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
};

function formatDistance(value: number): string {
  return `${Math.abs(value).toFixed(2)}m`;
}

function describeAxisOffset(
  value: number | undefined,
  negativeLabel: string,
  positiveLabel: string,
): string {
  const offset = value ?? 0;
  if (Math.abs(offset) < 0.005) return `centered on ${negativeLabel}/${positiveLabel}`;
  return `${formatDistance(offset)} ${offset < 0 ? negativeLabel : positiveLabel}`;
}

function objectLabel(object: RelationshipPromptObject): string {
  return object.partRole?.trim() || object.name?.trim() || "part";
}

export function buildRelationshipPrompt(
  object: RelationshipPromptObject,
  parent?: RelationshipPromptObject,
): string {
  const label = objectLabel(object);
  const x = describeAxisOffset(object.px, "left", "right");
  const y = describeAxisOffset(object.py, "below", "above");
  const z = describeAxisOffset(object.pz, "back", "front");
  const scale = [object.sx ?? 1, object.sy ?? 1, object.sz ?? 1]
    .map((value) => value.toFixed(2))
    .join(", ");
  const rotation = [object.rx ?? 0, object.ry ?? 0, object.rz ?? 0]
    .map((value) => value.toFixed(3))
    .join(", ");

  if (!parent) {
    return `Position context: ${label} is a root scene object; its local origin is ${x}, ${y}, and ${z} from the scene origin, with local scale (${scale}) and rotation (${rotation}) radians.`;
  }

  const parentLabel = objectLabel(parent);
  return `Position context: ${label} is a child part of ${parentLabel}; its local origin sits ${x}, ${y}, and ${z} from the parent origin, with local scale (${scale}) and rotation (${rotation}) radians.`;
}
