import * as THREE from "three";
import type * as Y from "yjs";

// ---------------------------------------------------------------------------
// Local ↔ World transform utilities
//
// YJS stores LOCAL transforms (relative to parent). These helpers convert
// between local and world space by walking the parent chain.
// ---------------------------------------------------------------------------

export type TransformTuple = {
  px: number; py: number; pz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
};

// Scratch objects — reused across calls to avoid allocations.
// These are module-level singletons, safe because JS is single-threaded.
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();
const _mat = new THREE.Matrix4();
const _parentMat = new THREE.Matrix4();
const _invParentMat = new THREE.Matrix4();

/** Read px…sz from a Y.Map and build a local TRS matrix. */
function readLocalMatrix(objMap: Y.Map<unknown>, out: THREE.Matrix4): THREE.Matrix4 {
  const px = (objMap.get("px") as number) ?? 0;
  const py = (objMap.get("py") as number) ?? 0;
  const pz = (objMap.get("pz") as number) ?? 0;
  const rx = (objMap.get("rx") as number) ?? 0;
  const ry = (objMap.get("ry") as number) ?? 0;
  const rz = (objMap.get("rz") as number) ?? 0;
  const sx = (objMap.get("sx") as number) ?? 1;
  const sy = (objMap.get("sy") as number) ?? 1;
  const sz = (objMap.get("sz") as number) ?? 1;

  _pos.set(px, py, pz);
  _euler.set(rx, ry, rz);
  _quat.setFromEuler(_euler);
  _scale.set(sx, sy, sz);

  return out.compose(_pos, _quat, _scale);
}

/**
 * Compute the world matrix for an object by composing local matrices
 * up the parent chain.  result = root.local * … * parent.local * self.local
 */
export function computeWorldMatrix(
  objectId: string,
  objectsMap: Y.Map<Y.Map<unknown>>,
  out?: THREE.Matrix4,
): THREE.Matrix4 {
  const result = out ?? new THREE.Matrix4();

  // Gather the parent chain (self first, root last)
  const chain: Y.Map<unknown>[] = [];
  let current: string | undefined = objectId;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current)) break; // cycle guard
    visited.add(current);
    const objMap = objectsMap.get(current);
    if (!objMap) break;
    chain.push(objMap);
    current = objMap.get("parentId") as string | undefined;
  }

  // Compose from root → self  (reverse order)
  result.identity();
  for (let i = chain.length - 1; i >= 0; i--) {
    readLocalMatrix(chain[i], _mat);
    result.multiply(_mat);
  }

  return result;
}

/**
 * Compute the world matrix of an object's parent.
 * Returns identity if the object has no parent.
 */
export function computeParentWorldMatrix(
  objectId: string,
  objectsMap: Y.Map<Y.Map<unknown>>,
  out?: THREE.Matrix4,
): THREE.Matrix4 {
  const result = out ?? new THREE.Matrix4();
  const objMap = objectsMap.get(objectId);
  if (!objMap) return result.identity();

  const parentId = objMap.get("parentId") as string | undefined;
  if (!parentId) return result.identity();

  return computeWorldMatrix(parentId, objectsMap, result);
}

/** Decompose a Matrix4 into px…sz values. */
export function decomposeMatrix(mat: THREE.Matrix4): TransformTuple {
  mat.decompose(_pos, _quat, _scale);
  _euler.setFromQuaternion(_quat);
  return {
    px: _pos.x, py: _pos.y, pz: _pos.z,
    rx: _euler.x, ry: _euler.y, rz: _euler.z,
    sx: _scale.x, sy: _scale.y, sz: _scale.z,
  };
}

/**
 * Convert world-space transforms to local-space relative to a parent.
 * If parentWorldMatrix is identity, the result equals the input.
 */
export function worldToLocal(
  world: TransformTuple,
  parentWorldMatrix: THREE.Matrix4,
): TransformTuple {
  // Build world matrix from the given values
  _pos.set(world.px, world.py, world.pz);
  _euler.set(world.rx, world.ry, world.rz);
  _quat.setFromEuler(_euler);
  _scale.set(world.sx, world.sy, world.sz);
  _mat.compose(_pos, _quat, _scale);

  // local = inverse(parentWorld) * worldMatrix
  _invParentMat.copy(parentWorldMatrix).invert();
  _mat.premultiply(_invParentMat);

  return decomposeMatrix(_mat);
}

/**
 * Convert local-space transforms to world-space given the parent's world matrix.
 */
export function localToWorld(
  local: TransformTuple,
  parentWorldMatrix: THREE.Matrix4,
): TransformTuple {
  _pos.set(local.px, local.py, local.pz);
  _euler.set(local.rx, local.ry, local.rz);
  _quat.setFromEuler(_euler);
  _scale.set(local.sx, local.sy, local.sz);
  _mat.compose(_pos, _quat, _scale);

  // world = parentWorld * localMatrix
  _mat.premultiply(parentWorldMatrix);

  return decomposeMatrix(_mat);
}

/**
 * Read an object's local transform from its Y.Map.
 */
export function readTransformFromMap(objMap: Y.Map<unknown>): TransformTuple {
  return {
    px: (objMap.get("px") as number) ?? 0,
    py: (objMap.get("py") as number) ?? 0,
    pz: (objMap.get("pz") as number) ?? 0,
    rx: (objMap.get("rx") as number) ?? 0,
    ry: (objMap.get("ry") as number) ?? 0,
    rz: (objMap.get("rz") as number) ?? 0,
    sx: (objMap.get("sx") as number) ?? 1,
    sy: (objMap.get("sy") as number) ?? 1,
    sz: (objMap.get("sz") as number) ?? 1,
  };
}

/**
 * Write a TransformTuple to a Y.Map (does NOT wrap in a transaction).
 */
export function writeTransformToMap(objMap: Y.Map<unknown>, t: TransformTuple) {
  objMap.set("px", t.px);
  objMap.set("py", t.py);
  objMap.set("pz", t.pz);
  objMap.set("rx", t.rx);
  objMap.set("ry", t.ry);
  objMap.set("rz", t.rz);
  objMap.set("sx", t.sx);
  objMap.set("sy", t.sy);
  objMap.set("sz", t.sz);
}
