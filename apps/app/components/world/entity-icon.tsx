"use client";

import { useVocabulary } from "@/components/workspace/vocabulary";
import { Icon, type IconName } from "@plotra/icons";
import { isEntityIcon } from "@/lib/world";
import { nodeKindMeta, type BinderNode } from "@/lib/tree";
import { useWorld } from "./data";

/** The icon of a custom entity type, in the type's colour. */
export function EntityIcon({ type, className }: { type: { icon: string; color: string }; className?: string }) {
  const name: IconName = isEntityIcon(type.icon) ? type.icon : "box-linear";
  return (
    <span style={{ color: type.color }} className="inline-flex shrink-0">
      <Icon name={name} className={className ?? "size-4"} />
    </span>
  );
}

/** A binder node's icon: its kind's, or its custom type's for world entries. */
export function NodeIcon({ node, open, className }: { node: Pick<BinderNode, "kind" | "entityTypeId"> & { settings?: BinderNode["settings"] }; open?: boolean; className?: string }) {
  const type = useEntityType(node.entityTypeId);
  if (node.kind === "entity" && type) return <EntityIcon type={type} className={className} />;
  // A canvas made as a map (lib/canvas.ts).
  if (node.kind === "canvas" && node.settings?.board === "map") return <Icon name="map-linear" className={className} />;
  return <Icon name={node.kind === "folder" && open ? "folder-open-linear" : nodeKindMeta[node.kind].icon} className={className} />;
}

export function useEntityType(id: string | null | undefined) {
  const { data } = useWorld();
  return id ? data?.entityTypes.find((t) => t.id === id) : undefined;
}

/** What to call a node's kind: "Faction" for a custom entity, "Scene" for a scene. */
export function useKindLabel(node: Pick<BinderNode, "kind" | "entityTypeId">) {
  const type = useEntityType(node.entityTypeId);
  const words = useVocabulary();
  return node.kind === "entity" && type ? type.name : words.label(node.kind);
}
