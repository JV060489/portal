import * as THREE from "three";
import type { LocalBounds, SceneObjectData, Vec3 } from "@/lib/yjs/types";
import { createLocalBounds } from "@/lib/yjs/types";

export type SceneBoundsContext = {
  id: string;
  parentId?: string;
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  localBounds?: LocalBounds;
};

export type WorldBoundsSummary = {
  bounds: LocalBounds;
  anchors: {
    center: Vec3;
    topCenter: Vec3;
    bottomCenter: Vec3;
  };
};

const CORNERS: Vec3[] = [
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
];

export function sanitizeLocalBounds(
  bounds: LocalBounds | undefined,
): LocalBounds | undefined {
  if (!bounds) return undefined;
  return createLocalBounds(bounds.min, bounds.max);
}

export function localBoundsFromGeometry(
  geometry: THREE.BufferGeometry,
): LocalBounds | undefined {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return undefined;

  return createLocalBounds(
    [box.min.x, box.min.y, box.min.z],
    [box.max.x, box.max.y, box.max.z],
  );
}

export function computeWorldBoundsMap(
  objects: Array<
    Pick<
      SceneObjectData,
      | "parentId"
      | "px"
      | "py"
      | "pz"
      | "rx"
      | "ry"
      | "rz"
      | "sx"
      | "sy"
      | "sz"
      | "localBounds"
    > & { id: string }
  >,
): Map<string, WorldBoundsSummary> {
  const objectMap = new Map(objects.map((obj) => [obj.id, obj]));
  const worldMatrixCache = new Map<string, THREE.Matrix4>();
  const summary = new Map<string, WorldBoundsSummary>();

  const computeWorldMatrix = (id: string): THREE.Matrix4 => {
    const cached = worldMatrixCache.get(id);
    if (cached) return cached.clone();

    const obj = objectMap.get(id);
    const local = new THREE.Matrix4();
    const euler = new THREE.Euler(obj?.rx ?? 0, obj?.ry ?? 0, obj?.rz ?? 0);
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    local.compose(
      new THREE.Vector3(obj?.px ?? 0, obj?.py ?? 0, obj?.pz ?? 0),
      quaternion,
      new THREE.Vector3(obj?.sx ?? 1, obj?.sy ?? 1, obj?.sz ?? 1),
    );

    if (obj?.parentId && objectMap.has(obj.parentId)) {
      const parentWorld = computeWorldMatrix(obj.parentId);
      local.premultiply(parentWorld);
    }

    worldMatrixCache.set(id, local.clone());
    return local;
  };

  for (const obj of objects) {
    if (!obj.localBounds) continue;

    const worldMatrix = computeWorldMatrix(obj.id);
    const points = getBoundsCorners(obj.localBounds).map((corner) =>
      corner.applyMatrix4(worldMatrix),
    );
    const box = new THREE.Box3().setFromPoints(points);
    const bounds = createLocalBounds(
      [box.min.x, box.min.y, box.min.z],
      [box.max.x, box.max.y, box.max.z],
    );
    summary.set(obj.id, {
      bounds,
      anchors: {
        center: bounds.center,
        topCenter: [bounds.center[0], bounds.max[1], bounds.center[2]],
        bottomCenter: [bounds.center[0], bounds.min[1], bounds.center[2]],
      },
    });
  }

  return summary;
}

function getBoundsCorners(bounds: LocalBounds): THREE.Vector3[] {
  const halfSize = new THREE.Vector3(
    bounds.size[0] / 2,
    bounds.size[1] / 2,
    bounds.size[2] / 2,
  );
  const center = new THREE.Vector3(
    bounds.center[0],
    bounds.center[1],
    bounds.center[2],
  );

  return CORNERS.map(
    ([x, y, z]) =>
      new THREE.Vector3(
        center.x + halfSize.x * x,
        center.y + halfSize.y * y,
        center.z + halfSize.z * z,
      ),
  );
}
