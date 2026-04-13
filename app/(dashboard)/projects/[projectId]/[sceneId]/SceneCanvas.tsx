"use client";

import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  Grid,
  OrbitControls,
  TransformControls,
  Outlines,
} from "@react-three/drei";
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  useControls,
  useStoreContext,
  LevaPanel,
  LevaStoreProvider,
  useCreateStore,
} from "leva";
import * as THREE from "three";
import * as Y from "yjs";
import { useYjs } from "@/lib/yjs/provider";
import {
  useYjsObject,
  useYjsCamera,
  useYjsObjects,
  useYjsBatchDelete,
  buildChildrenMap,
} from "@/lib/yjs/hooks";
import {
  DEFAULT_CAMERA,
  type CameraData,
  type SceneObjectData,
} from "@/lib/yjs/types";
import SceneObjectTree from "@/components/sceneComponents/SceneObjectTree";
import { AiChatBox } from "@/components/sceneComponents/AiChatBox";
import { cn } from "@/lib/utils";
import { useRenameScene } from "@/features/projects/hooks/use-projects";
import { useOpenScadPreview } from "@/lib/openscad/use-openscad-preview";
import { sanitizeLocalBounds } from "@/lib/scene/bounds";
import { buildRelationshipPrompt } from "@/lib/scene/relationship-prompt";

const LEGACY_METER_SCALE_CAMERA: CameraData = {
  px: 5,
  py: 4,
  pz: 5,
  tx: 0,
  ty: 0,
  tz: 0,
};

function isSameCamera(a: CameraData, b: CameraData) {
  return (
    a.px === b.px &&
    a.py === b.py &&
    a.pz === b.pz &&
    a.tx === b.tx &&
    a.ty === b.ty &&
    a.tz === b.tz
  );
}


// ---------------------------------------------------------------------------
// SceneTopBar — back button, double-click rename, connection status
// ---------------------------------------------------------------------------

function SceneTopBar({
  sceneName,
  sceneId,
}: {
  sceneName: string;
  sceneId: string;
}) {
  const renameScene = useRenameScene();
  const [editing, setEditing] = useState(false);
  const [localName, setLocalName] = useState(sceneName);
  const [draft, setDraft] = useState(sceneName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== localName) {
      setLocalName(trimmed);
      renameScene.mutate({ sceneId, name: trimmed });
    } else {
      setDraft(localName);
    }
    setEditing(false);
  };

  return (
    <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between gap-2">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(localName); setEditing(false); }
          }}
          className="bg-neutral-800 border border-neutral-600 rounded px-2 py-0.5 text-sm text-white outline-none focus:border-neutral-400"
          style={{ width: `calc(${Math.max(draft.length, 4)}ch + 1.5rem)` }}
        />
      ) : renameScene.isPending ? (
        <div
          className="rounded px-2 py-0.5 border border-transparent bg-neutral-700 animate-pulse"
          style={{ width: `calc(${Math.max(localName.length, 4)}ch + 1.5rem)`, height: "1.5rem" }}
        />
      ) : (
        <h1
          className="text-sm font-medium cursor-text select-none text-white border border-transparent px-2 py-0.5 rounded"
          onDoubleClick={() => { setDraft(localName); setEditing(true); }}
          title="Double-click to rename"
        >
          {localName}
        </h1>
      )}

      <ConnectionStatus />
    </div>
  );
}

function toDeg(rad: number) {
  return rad * (180 / Math.PI);
}
function toRad(deg: number) {
  return deg * (Math.PI / 180);
}

type TransformMode = "translate" | "rotate" | "scale";
type AxisConstraint = "none" | "x" | "y" | "z";

type WorldTransformSnapshot = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

function captureWorldTransform(
  object: THREE.Object3D,
  snapshot: WorldTransformSnapshot,
) {
  object.updateWorldMatrix(true, false);
  object.matrixWorld.decompose(
    snapshot.position,
    snapshot.quaternion,
    snapshot.scale,
  );
}

function writeWorldTransformToGroup(
  group: THREE.Group,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
  scale: THREE.Vector3,
) {
  const worldMatrix = new THREE.Matrix4().compose(position, quaternion, scale);

  if (group.parent) {
    group.parent.updateWorldMatrix(true, false);
    worldMatrix.premultiply(
      new THREE.Matrix4().copy(group.parent.matrixWorld).invert(),
    );
  }

  worldMatrix.decompose(group.position, group.quaternion, group.scale);
  group.updateMatrixWorld(true);
}

function getGroupBoundsCenter(group: THREE.Group, target: THREE.Vector3) {
  group.updateWorldMatrix(true, true);

  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    group.getWorldPosition(target);
    return;
  }

  box.getCenter(target);
}

function readRelationshipObject(objMap: Y.Map<unknown>) {
  return {
    name: objMap.get("name") as string | undefined,
    partRole: objMap.get("partRole") as string | undefined,
    parentId: objMap.get("parentId") as string | undefined,
    px: (objMap.get("px") as number | undefined) ?? 0,
    py: (objMap.get("py") as number | undefined) ?? 0,
    pz: (objMap.get("pz") as number | undefined) ?? 0,
    rx: (objMap.get("rx") as number | undefined) ?? 0,
    ry: (objMap.get("ry") as number | undefined) ?? 0,
    rz: (objMap.get("rz") as number | undefined) ?? 0,
    sx: (objMap.get("sx") as number | undefined) ?? 1,
    sy: (objMap.get("sy") as number | undefined) ?? 1,
    sz: (objMap.get("sz") as number | undefined) ?? 1,
  };
}

function updateRelationshipPrompt(
  objMap: Y.Map<unknown>,
  objectsMap: Y.Map<Y.Map<unknown>>,
) {
  if (
    !objMap.get("parentId") &&
    !objMap.get("partRole") &&
    !objMap.get("relationshipPrompt")
  ) {
    return;
  }

  const object = readRelationshipObject(objMap);
  const parentMap = object.parentId
    ? objectsMap.get(object.parentId)
    : undefined;
  objMap.set(
    "relationshipPrompt",
    buildRelationshipPrompt(
      object,
      parentMap ? readRelationshipObject(parentMap) : undefined,
    ),
  );
}

// ---------------------------------------------------------------------------
// ObjectGeometry — renders the correct geometry based on type
// ---------------------------------------------------------------------------

function ObjectGeometry({ geometry }: { geometry: string }) {
  switch (geometry) {
    case "sphere":
      return <sphereGeometry args={[0.5, 32, 16]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 32]} />;
    case "torus":
      return <torusGeometry args={[0.5, 0.2, 16, 32]} />;
    case "plane":
      return <planeGeometry args={[1, 1]} />;
    case "circle":
      return <circleGeometry args={[0.5, 32]} />;
    case "icosahedron":
      return <icosahedronGeometry args={[0.5, 0]} />;
    case "box":
    default:
      return <boxGeometry args={[1, 1, 1]} />;
  }
}

function SelectedObjectOutline({
  meshRef,
  isPrimary,
}: {
  meshRef: React.RefObject<THREE.Mesh | null>;
  isPrimary: boolean;
}) {
  const [geometryVersion, setGeometryVersion] = useState("");
  const geometryVersionRef = useRef("");

  useFrame(() => {
    const nextVersion = meshRef.current?.geometry?.uuid ?? "";
    if (geometryVersionRef.current === nextVersion) return;

    geometryVersionRef.current = nextVersion;
    setGeometryVersion(nextVersion);
  });

  if (!geometryVersion) return null;

  return (
    <Outlines
      key={geometryVersion}
      angle={0}
      color={isPrimary ? "#ffffff" : "#bfdbfe"}
      polygonOffset
      polygonOffsetFactor={1}
      renderOrder={1}
      thickness={isPrimary ? 1.5 : 1}
      toneMapped={false}
    />
  );
}

function GeneratedMeshContent({
  objectId,
  objectData,
  onStatusChange,
}: {
  objectId: string;
  objectData: SceneObjectData;
  onStatusChange?: (status: "idle" | "compiling" | "ready" | "error") => void;
}) {
  const { geometry, bounds, status, error } = useOpenScadPreview(
    objectData.openscadCode,
    objectData.geometryRevision ?? 1,
  );
  const { writeObjectData } = useYjsObject(objectId);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    const currentBounds = sanitizeLocalBounds(objectData.localBounds);
    const nextBounds = sanitizeLocalBounds(bounds);
    const currentBoundsJson = currentBounds
      ? JSON.stringify(currentBounds)
      : undefined;
    const nextBoundsJson = nextBounds ? JSON.stringify(nextBounds) : undefined;

    if (status === "compiling" && objectData.compileStatus !== "compiling") {
      writeObjectData({ compileStatus: "compiling", compileError: undefined });
      return;
    }

    if (status === "error" && objectData.compileStatus !== "error") {
      writeObjectData({
        compileStatus: "error",
        compileError: error ?? "OpenSCAD compilation failed.",
      });
      return;
    }

    if (
      status === "ready" &&
      (objectData.compileStatus !== "ready" ||
        currentBoundsJson !== nextBoundsJson ||
        objectData.compileError)
    ) {
      writeObjectData({
        compileStatus: "ready",
        compileError: undefined,
        localBounds: nextBounds,
      });
    }
  }, [
    bounds,
    error,
    objectData.compileError,
    objectData.compileStatus,
    objectData.localBounds,
    status,
    writeObjectData,
  ]);

  if (!geometry) return null;

  return <primitive object={geometry} attach="geometry" />;
}

function SceneMesh({
  objectId,
  objectData,
  onGeneratedStatusChange,
}: {
  objectId: string;
  objectData: SceneObjectData;
  onGeneratedStatusChange?: (
    status: "idle" | "compiling" | "ready" | "error",
  ) => void;
}) {
  if (objectData.geometryKind === "generated") {
    return (
      <GeneratedMeshContent
        objectId={objectId}
        objectData={objectData}
        onStatusChange={onGeneratedStatusChange}
      />
    );
  }

  return <ObjectGeometry geometry={objectData.geometry} />;
}

function isCanvasReadyObject(object: SceneObjectData | undefined | null) {
  return (
    object?.geometryKind === "group" ||
    object?.geometryKind !== "generated" ||
    object.compileStatus === "ready"
  );
}

// ---------------------------------------------------------------------------
// CameraSync — reads/writes camera state via YJS
// ---------------------------------------------------------------------------

function CameraSync() {
  const { camera } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const { writeCamera, observeCamera, readCamera, isApplyingRemote } =
    useYjsCamera();
  const { synced } = useYjs();
  const initialized = useRef(false);

  useEffect(() => {
    if (!synced || initialized.current) return;
    const cam = readCamera();
    if (!cam) return;

    const activeCamera = isSameCamera(cam, LEGACY_METER_SCALE_CAMERA)
      ? DEFAULT_CAMERA
      : cam;

    camera.position.set(activeCamera.px, activeCamera.py, activeCamera.pz);
    if (controlsRef.current) {
      controlsRef.current.target.set(
        activeCamera.tx,
        activeCamera.ty,
        activeCamera.tz,
      );
      controlsRef.current.update();
    }
    initialized.current = true;

    if (activeCamera !== cam) {
      writeCamera(DEFAULT_CAMERA);
    }
  }, [synced, readCamera, writeCamera, camera]);

  useEffect(() => {
    if (!synced) return;

    return observeCamera((changes) => {
      if (
        changes.px !== undefined ||
        changes.py !== undefined ||
        changes.pz !== undefined
      ) {
        camera.position.set(
          changes.px ?? camera.position.x,
          changes.py ?? camera.position.y,
          changes.pz ?? camera.position.z,
        );
      }
      if (
        controlsRef.current &&
        (changes.tx !== undefined ||
          changes.ty !== undefined ||
          changes.tz !== undefined)
      ) {
        const t = controlsRef.current.target;
        controlsRef.current.target.set(
          changes.tx ?? t.x,
          changes.ty ?? t.y,
          changes.tz ?? t.z,
        );
        controlsRef.current.update();
      }
    });
  }, [synced, observeCamera, camera]);

  const handleCameraEnd = () => {
    if (isApplyingRemote.current) return;
    const target = controlsRef.current?.target;
    writeCamera({
      px: camera.position.x,
      py: camera.position.y,
      pz: camera.position.z,
      tx: target?.x ?? 0,
      ty: target?.y ?? 0,
      tz: target?.z ?? 0,
    });
  };

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      minDistance={0.01}
      maxDistance={10}
      onEnd={handleCameraEnd}
    />
  );
}

// ---------------------------------------------------------------------------
// SceneObject — a single YJS-synced 3D object rendered as a <group>.
//
// LOCAL transforms from YJS are applied to the group. Children are rendered
// as nested SceneObjects inside the group, so Three.js scene graph nesting
// handles world-space positioning automatically — no manual propagation.
// ---------------------------------------------------------------------------

function SceneObject({
  objectId,
  childIds,
  isSelected,
  isPrimary,
  onSelect,
  onGroupReady,
  allSelectedIds,
  allPrimaryId,
  allChildrenMap,
  onGroupReadyMap,
}: {
  objectId: string;
  childIds: string[];
  isSelected: boolean;
  isPrimary: boolean;
  onSelect: (
    id: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean },
  ) => void;
  onGroupReady: (id: string, group: THREE.Group | null) => void;
  allSelectedIds: Set<string>;
  allPrimaryId: string | null;
  allChildrenMap: Map<string, string[]>;
  onGroupReadyMap: (id: string, group: THREE.Group | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const { observeObject, readObject } = useYjsObject(objectId);
  const { synced } = useYjs();

  const [objectData, setObjectData] = useState(
    () => readObject() ?? null,
  );
  const [materialColor, setMaterialColor] = useState(
    objectData?.materialColor ?? "#4f8fff",
  );
  const [generatedPreviewStatus, setGeneratedPreviewStatus] = useState<
    "idle" | "compiling" | "ready" | "error"
  >("idle");
  const isGroup = objectData?.geometryKind === "group";
  const isCanvasReady =
    isGroup
      ? true
      : objectData?.geometryKind === "generated"
      ? generatedPreviewStatus === "ready"
      : isCanvasReadyObject(objectData);
  const guardedRaycast = useCallback(
    (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const mesh = meshRef.current;
      if (!isCanvasReady || !mesh) return;

      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    },
    [isCanvasReady],
  );

  const setGroupRef = useCallback(
    (node: THREE.Group | null) => {
      groupRef.current = node;
      onGroupReady(objectId, node);
      onGroupReadyMap(objectId, node);
      // Apply current LOCAL YJS state imperatively on mount
      if (node) {
        const data = readObject();
        if (data) {
          setObjectData(data);
          setMaterialColor(data.materialColor);
          node.position.set(data.px, data.py, data.pz);
          node.rotation.set(data.rx, data.ry, data.rz);
          node.scale.set(data.sx, data.sy, data.sz);
        }
      }
    },
    [objectId, onGroupReady, onGroupReadyMap, readObject],
  );

  // Observe remote Y.Doc changes → apply LOCAL transforms to group
  useEffect(() => {
    if (!synced) return;

    return observeObject((changes: Partial<SceneObjectData>) => {
      const group = groupRef.current;
      if (!group) return;

      setObjectData((prev) => {
        if (!prev) return readObject();
        return { ...prev, ...changes };
      });

      if (changes.materialColor !== undefined) {
        setMaterialColor(changes.materialColor);
      }

      if (
        changes.px !== undefined ||
        changes.py !== undefined ||
        changes.pz !== undefined
      ) {
        group.position.set(
          changes.px ?? group.position.x,
          changes.py ?? group.position.y,
          changes.pz ?? group.position.z,
        );
      }
      if (
        changes.rx !== undefined ||
        changes.ry !== undefined ||
        changes.rz !== undefined
      ) {
        group.rotation.set(
          changes.rx ?? group.rotation.x,
          changes.ry ?? group.rotation.y,
          changes.rz ?? group.rotation.z,
        );
      }
      if (
        changes.sx !== undefined ||
        changes.sy !== undefined ||
        changes.sz !== undefined
      ) {
        group.scale.set(
          changes.sx ?? group.scale.x,
          changes.sy ?? group.scale.y,
          changes.sz ?? group.scale.z,
        );
      }
    });
  }, [synced, observeObject, readObject]);

  return (
    <group ref={setGroupRef}>
      {/* The actual mesh — at identity transform within the group */}
      {!isGroup && (
        <mesh
          ref={meshRef}
          visible={isCanvasReady}
          raycast={guardedRaycast}
          onClick={(e) => {
            if (!isCanvasReady) return;
            e.stopPropagation();
            onSelect(objectId, {
              shiftKey: e.shiftKey,
              ctrlKey: e.ctrlKey || e.metaKey,
            });
          }}
        >
          {objectData ? (
            <SceneMesh
              objectId={objectId}
              objectData={objectData}
              onGeneratedStatusChange={setGeneratedPreviewStatus}
            />
          ) : (
            <ObjectGeometry geometry="box" />
          )}
          <meshStandardMaterial color={materialColor} />
          {isSelected && isCanvasReady && (
            <SelectedObjectOutline meshRef={meshRef} isPrimary={isPrimary} />
          )}
        </mesh>
      )}

      {/* Children nested inside this group — they inherit parent transforms */}
      {childIds.map((childId) => (
        <SceneObject
          key={childId}
          objectId={childId}
          childIds={allChildrenMap.get(childId) ?? []}
          isSelected={allSelectedIds.has(childId)}
          isPrimary={childId === allPrimaryId}
          onSelect={onSelect}
          onGroupReady={onGroupReady}
          allSelectedIds={allSelectedIds}
          allPrimaryId={allPrimaryId}
          allChildrenMap={allChildrenMap}
          onGroupReadyMap={onGroupReadyMap}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// SelectedObjectControls — Leva + TransformControls for the selected object
//
// With scene graph nesting, moving a parent automatically moves children.
// No child propagation code needed — just write the selected object's
// LOCAL transform to YJS.
// ---------------------------------------------------------------------------

function SelectedObjectControls({
  objectId,
  groupObject,
  transformMode,
  axisConstraint,
}: {
  objectId: string;
  groupObject: THREE.Group;
  transformMode: TransformMode;
  axisConstraint: AxisConstraint;
}) {
  const store = useStoreContext();
  const isDragging = useRef(false);
  const isMounted = useRef(true);
  const { writeTransform, readObject, isApplyingRemote } =
    useYjsObject(objectId);
  const { synced } = useYjs();
  const groupRef = useRef(groupObject);
  const [controlTarget] = useState(() => {
    const target = new THREE.Object3D();
    target.name = `TransformControlsCenter:${objectId}`;
    return target;
  });
  const groupDragStart = useRef<WorldTransformSnapshot>({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  });
  const controlDragStart = useRef<WorldTransformSnapshot>({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  });
  const liveControlTransform = useRef<WorldTransformSnapshot>({
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  });
  const scratchPosition = useRef(new THREE.Vector3());
  const scratchQuaternion = useRef(new THREE.Quaternion());
  const scratchScale = useRef(new THREE.Vector3(1, 1, 1));
  const scratchOffset = useRef(new THREE.Vector3());
  const scratchScaleRatio = useRef(new THREE.Vector3(1, 1, 1));
  const scratchDeltaQuaternion = useRef(new THREE.Quaternion());
  const scratchInverseQuaternion = useRef(new THREE.Quaternion());
  const scratchBoundsCenter = useRef(new THREE.Vector3());

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    groupRef.current = groupObject;
  }, [groupObject]);

  const syncControlTargetToGroup = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;

    getGroupBoundsCenter(group, scratchBoundsCenter.current);
    captureWorldTransform(group, liveControlTransform.current);

    controlTarget.position.copy(scratchBoundsCenter.current);
    controlTarget.quaternion.copy(liveControlTransform.current.quaternion);
    controlTarget.scale.copy(liveControlTransform.current.scale);
    controlTarget.updateMatrixWorld(true);
  }, [controlTarget]);

  const applyControlTargetDeltaToGroup = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;

    captureWorldTransform(controlTarget, liveControlTransform.current);

    const scaleRatio = scratchScaleRatio.current.set(
      controlDragStart.current.scale.x !== 0
        ? liveControlTransform.current.scale.x / controlDragStart.current.scale.x
        : 1,
      controlDragStart.current.scale.y !== 0
        ? liveControlTransform.current.scale.y / controlDragStart.current.scale.y
        : 1,
      controlDragStart.current.scale.z !== 0
        ? liveControlTransform.current.scale.z / controlDragStart.current.scale.z
        : 1,
    );

    scratchInverseQuaternion.current
      .copy(controlDragStart.current.quaternion)
      .invert();
    const deltaQuaternion = scratchDeltaQuaternion.current
      .copy(liveControlTransform.current.quaternion)
      .multiply(scratchInverseQuaternion.current);

    const pivotOffset = scratchOffset.current
      .copy(groupDragStart.current.position)
      .sub(controlDragStart.current.position)
      .multiply(scaleRatio)
      .applyQuaternion(deltaQuaternion);
    const newPosition = scratchPosition.current
      .copy(liveControlTransform.current.position)
      .add(pivotOffset);

    const newQuaternion = scratchQuaternion.current
      .copy(deltaQuaternion)
      .multiply(groupDragStart.current.quaternion);
    const newScale = scratchScale.current
      .copy(groupDragStart.current.scale)
      .multiply(scaleRatio);

    writeWorldTransformToGroup(group, newPosition, newQuaternion, newScale);
  }, [controlTarget]);

  const initial = readObject();
  const initPos = initial
    ? { x: initial.px, y: initial.py, z: initial.pz }
    : { x: 0, y: 0.5, z: 0 };
  const initRot = initial
    ? { x: toDeg(initial.rx), y: toDeg(initial.ry), z: toDeg(initial.rz) }
    : { x: 0, y: 0, z: 0 };
  const initScale = initial
    ? { x: initial.sx, y: initial.sy, z: initial.sz }
    : { x: 1, y: 1, z: 1 };
  const objectName = initial?.name ?? "Object";

  const [, set] = useControls(
    objectName,
    () => ({
      position: {
        value: initPos,
        step: 0.1,
        onChange: (v: { x: number; y: number; z: number }) => {
          const group = groupRef.current;
          if (
            !group ||
            !isMounted.current ||
            isDragging.current ||
            isApplyingRemote.current
          )
            return;
          group.position.set(v.x, v.y, v.z);
          writeTransform({ px: v.x, py: v.y, pz: v.z });
        },
      },
      rotation: {
        value: initRot,
        step: 1,
        onChange: (v: { x: number; y: number; z: number }) => {
          const group = groupRef.current;
          if (
            !group ||
            !isMounted.current ||
            isDragging.current ||
            isApplyingRemote.current
          )
            return;
          group.rotation.set(toRad(v.x), toRad(v.y), toRad(v.z));
          writeTransform({ rx: toRad(v.x), ry: toRad(v.y), rz: toRad(v.z) });
        },
      },
      scale: {
        value: initScale,
        step: 0.1,
        min: 0.01,
        onChange: (v: { x: number; y: number; z: number }) => {
          const group = groupRef.current;
          if (
            !group ||
            !isMounted.current ||
            isDragging.current ||
            isApplyingRemote.current
          )
            return;
          group.scale.set(v.x, v.y, v.z);
          writeTransform({ sx: v.x, sy: v.y, sz: v.z });
        },
      },
    }),
    { store },
  );

  // Observe remote changes → sync to Leva
  const { observeObject } = useYjsObject(objectId);

  useEffect(() => {
    if (!synced) return;

    return observeObject(() => {
      const group = groupRef.current;
      if (!group) return;

      set({
        position: {
          x: group.position.x,
          y: group.position.y,
          z: group.position.z,
        },
        rotation: {
          x: toDeg(group.rotation.x),
          y: toDeg(group.rotation.y),
          z: toDeg(group.rotation.z),
        },
        scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
      });

      if (!isDragging.current) {
        syncControlTargetToGroup();
      }
    });
  }, [synced, observeObject, set, syncControlTargetToGroup]);

  // During drag: sync group → Leva + write local transform to YJS
  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;

    if (!isDragging.current) {
      syncControlTargetToGroup();
      return;
    }

    applyControlTargetDeltaToGroup();

    set({
      position: {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
      },
      rotation: {
        x: toDeg(group.rotation.x),
        y: toDeg(group.rotation.y),
        z: toDeg(group.rotation.z),
      },
      scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
    });

    // Only write THIS object's local transform — children follow via scene graph
    writeTransform({
      px: group.position.x,
      py: group.position.y,
      pz: group.position.z,
      rx: group.rotation.x,
      ry: group.rotation.y,
      rz: group.rotation.z,
      sx: group.scale.x,
      sy: group.scale.y,
      sz: group.scale.z,
    });
  });

  const showX = axisConstraint === "none" || axisConstraint === "x";
  const showY = axisConstraint === "none" || axisConstraint === "y";
  const showZ = axisConstraint === "none" || axisConstraint === "z";

  return (
    <>
      <primitive object={controlTarget} />
      <TransformControls
        object={controlTarget}
        mode={transformMode}
        showX={showX}
        showY={showY}
        showZ={showZ}
        onMouseDown={() => {
          const group = groupRef.current;
          if (!group) return;

          syncControlTargetToGroup();
          captureWorldTransform(group, groupDragStart.current);
          captureWorldTransform(controlTarget, controlDragStart.current);
          isDragging.current = true;
        }}
        onMouseUp={() => {
          applyControlTargetDeltaToGroup();
          isDragging.current = false;
          const group = groupRef.current;
          if (group) {
            set({
              position: {
                x: group.position.x,
                y: group.position.y,
                z: group.position.z,
              },
              rotation: {
                x: toDeg(group.rotation.x),
                y: toDeg(group.rotation.y),
                z: toDeg(group.rotation.z),
              },
              scale: { x: group.scale.x, y: group.scale.y, z: group.scale.z },
            });

            writeTransform(
              {
                px: group.position.x,
                py: group.position.y,
                pz: group.position.z,
                rx: group.rotation.x,
                ry: group.rotation.y,
                rz: group.rotation.z,
                sx: group.scale.x,
                sy: group.scale.y,
                sz: group.scale.z,
              },
              true,
            );
            syncControlTargetToGroup();
          }
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// GroupTransformControls — TransformControls on median pivot for multi-select
//
// With local transforms, we only need to write transforms for "selection
// roots" — selected objects whose parents are NOT also selected. Descendants
// of selected objects follow automatically through the scene graph.
// ---------------------------------------------------------------------------

type GroupSnapshot = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

function GroupTransformControls({
  selectedIds,
  groupMap,
  transformMode,
  axisConstraint,
}: {
  selectedIds: Set<string>;
  groupMap: Record<string, THREE.Group>;
  transformMode: TransformMode;
  axisConstraint: AxisConstraint;
}) {
  const [pivot] = useState(() => new THREE.Object3D());
  const isDragging = useRef(false);
  const snapshots = useRef<Map<string, GroupSnapshot>>(new Map());
  const pivotSnapshot = useRef<THREE.Vector3>(new THREE.Vector3());
  const pivotQuatSnapshot = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const pivotScaleSnapshot = useRef<THREE.Vector3>(new THREE.Vector3(1, 1, 1));
  const { doc, sceneMap, connected } = useYjs();

  const selectedArray = useMemo(() => [...selectedIds], [selectedIds]);

  // Compute world positions for pivot center using getWorldPosition
  useEffect(() => {
    if (selectedArray.length === 0) return;

    const center = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    let count = 0;
    for (const id of selectedArray) {
      const group = groupMap[id];
      if (group) {
        group.getWorldPosition(worldPos);
        center.add(worldPos);
        count++;
      }
    }
    if (count > 0) center.divideScalar(count);

    pivot.position.copy(center);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
  }, [selectedArray, groupMap, pivot, sceneMap]);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;

    pivotSnapshot.current.copy(pivot.position);
    pivotQuatSnapshot.current.copy(pivot.quaternion);
    pivotScaleSnapshot.current.copy(pivot.scale);

    // Only snapshot selection roots — exclude any id whose ancestor is also selected,
    // so descendants aren't double-transformed via both their own entry and their parent's.
    const selectedSet = new Set(selectedArray);
    const objectsMap = sceneMap.get("objects") as Y.Map<Y.Map<unknown>> | undefined;
    const rootIds = selectedArray.filter((id) => {
      if (!objectsMap) return true;
      let current = objectsMap.get(id)?.get("parentId") as string | undefined;
      while (current) {
        if (selectedSet.has(current)) return false; // ancestor is selected — skip
        current = objectsMap.get(current)?.get("parentId") as string | undefined;
      }
      return true;
    });

    snapshots.current.clear();
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    for (const id of rootIds) {
      const group = groupMap[id];
      if (group) {
        group.getWorldPosition(worldPos);
        group.getWorldQuaternion(worldQuat);
        group.getWorldScale(worldScale);
        snapshots.current.set(id, {
          position: worldPos.clone(),
          quaternion: worldQuat.clone(),
          scale: worldScale.clone(),
        });
      }
    }
  }, [selectedArray, groupMap, pivot, sceneMap]);

  // Temp vectors
  const _delta = useMemo(() => new THREE.Vector3(), []);
  const _deltaQuat = useMemo(() => new THREE.Quaternion(), []);
  const _invQuat = useMemo(() => new THREE.Quaternion(), []);
  const _offset = useMemo(() => new THREE.Vector3(), []);
  const _deltaScale = useMemo(() => new THREE.Vector3(), []);
  const _newWorldPos = useMemo(() => new THREE.Vector3(), []);
  const _newWorldQuat = useMemo(() => new THREE.Quaternion(), []);
  const _newWorldScale = useMemo(() => new THREE.Vector3(), []);
  const _parentWorldMat = useMemo(() => new THREE.Matrix4(), []);
  const _invParentWorld = useMemo(() => new THREE.Matrix4(), []);
  const _localMat = useMemo(() => new THREE.Matrix4(), []);
  const _localPos = useMemo(() => new THREE.Vector3(), []);
  const _localQuat = useMemo(() => new THREE.Quaternion(), []);
  const _localScale = useMemo(() => new THREE.Vector3(), []);
  const _localEuler = useMemo(() => new THREE.Euler(), []);

  const applyDeltaAndWrite = useCallback(
    () => {
      if (!connected) return;

      const objectsMap = sceneMap.get("objects") as
        | Y.Map<Y.Map<unknown>>
        | undefined;
      if (!objectsMap) return;

      // Compute pivot deltas
      _delta.copy(pivot.position).sub(pivotSnapshot.current);
      _invQuat.copy(pivotQuatSnapshot.current).invert();
      _deltaQuat.copy(pivot.quaternion).multiply(_invQuat);
      _deltaScale.set(
        pivotScaleSnapshot.current.x !== 0
          ? pivot.scale.x / pivotScaleSnapshot.current.x
          : 1,
        pivotScaleSnapshot.current.y !== 0
          ? pivot.scale.y / pivotScaleSnapshot.current.y
          : 1,
        pivotScaleSnapshot.current.z !== 0
          ? pivot.scale.z / pivotScaleSnapshot.current.z
          : 1,
      );

      const doWrite = () => {
        doc.transact(() => {
          for (const [id, snap] of snapshots.current) {
            const group = groupMap[id];
            if (!group) continue;

            // Compute new world position from snapshot + pivot delta
            _offset.copy(snap.position).sub(pivotSnapshot.current);
            _offset.applyQuaternion(_deltaQuat);
            _offset.multiply(_deltaScale);
            _newWorldPos.copy(pivotSnapshot.current).add(_delta).add(_offset);
            _newWorldQuat.copy(_deltaQuat).multiply(snap.quaternion);
            _newWorldScale.set(
              snap.scale.x * _deltaScale.x,
              snap.scale.y * _deltaScale.y,
              snap.scale.z * _deltaScale.z,
            );

            // Convert world → local by undoing parent's world transform
            if (group.parent && group.parent.type !== "Scene") {
              group.parent.updateWorldMatrix(true, false);
              _parentWorldMat.copy(group.parent.matrixWorld);
            } else {
              _parentWorldMat.identity();
            }
            _invParentWorld.copy(_parentWorldMat).invert();

            _localMat.compose(_newWorldPos, _newWorldQuat, _newWorldScale);
            _localMat.premultiply(_invParentWorld);
            _localMat.decompose(_localPos, _localQuat, _localScale);
            _localEuler.setFromQuaternion(_localQuat);

            // Apply to group
            group.position.copy(_localPos);
            group.quaternion.copy(_localQuat);
            group.scale.copy(_localScale);

            // Write local transform to YJS
            const objMap = objectsMap.get(id);
            if (objMap) {
              objMap.set("px", _localPos.x);
              objMap.set("py", _localPos.y);
              objMap.set("pz", _localPos.z);
              objMap.set("rx", _localEuler.x);
              objMap.set("ry", _localEuler.y);
              objMap.set("rz", _localEuler.z);
              objMap.set("sx", _localScale.x);
              objMap.set("sy", _localScale.y);
              objMap.set("sz", _localScale.z);
              updateRelationshipPrompt(objMap, objectsMap);
            }
          }
        }, "local-three");
      };

      doWrite();
    },
    [
      connected,
      doc,
      sceneMap,
      groupMap,
      pivot,
      _delta,
      _deltaQuat,
      _invQuat,
      _offset,
      _deltaScale,
      _newWorldPos,
      _newWorldQuat,
      _newWorldScale,
      _parentWorldMat,
      _invParentWorld,
      _localMat,
      _localPos,
      _localQuat,
      _localScale,
      _localEuler,
    ],
  );

  useFrame(() => {
    if (!isDragging.current) return;
    applyDeltaAndWrite();
  });

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
    applyDeltaAndWrite();

    // Recenter pivot
    const center = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    let count = 0;
    for (const id of selectedArray) {
      const group = groupMap[id];
      if (group) {
        group.getWorldPosition(worldPos);
        center.add(worldPos);
        count++;
      }
    }
    if (count > 0) center.divideScalar(count);
    pivot.position.copy(center);
    pivot.quaternion.identity();
    pivot.scale.set(1, 1, 1);
  }, [selectedArray, groupMap, pivot, applyDeltaAndWrite]);

  const showX = axisConstraint === "none" || axisConstraint === "x";
  const showY = axisConstraint === "none" || axisConstraint === "y";
  const showZ = axisConstraint === "none" || axisConstraint === "z";

  return (
    <>
      <primitive object={pivot} />
      <TransformControls
        object={pivot}
        mode={transformMode}
        showX={showX}
        showY={showY}
        showZ={showZ}
        onMouseDown={handleDragStart}
        onMouseUp={handleDragEnd}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// SceneContent — renders all objects as a nested tree + controls for selected
// ---------------------------------------------------------------------------

function SceneContent({
  selectedIds,
  primaryId,
  onSelect,
  transformMode,
  axisConstraint,
}: {
  selectedIds: Set<string>;
  primaryId: string | null;
  onSelect: (
    id: string,
    modifiers: { shiftKey: boolean; ctrlKey: boolean },
  ) => void;
  transformMode: TransformMode;
  axisConstraint: AxisConstraint;
}) {
  const objects = useYjsObjects();
  const [groupMap, setGroupMap] = useState<Record<string, THREE.Group>>({});

  const handleGroupReady = useCallback(
    (id: string, group: THREE.Group | null) => {
      setGroupMap((prev) => {
        if (group) {
          if (prev[id] === group) return prev;
          return { ...prev, [id]: group };
        } else {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }
      });
    },
    [],
  );

  // Build hierarchy
  const childrenMap = useMemo(() => buildChildrenMap(objects), [objects]);

  // Root objects: no parent or parent doesn't exist
  const rootIds = useMemo(() => {
    return objects
      .filter((o) => !o.parentId || !objects.some((p) => p.id === o.parentId))
      .map((o) => o.id);
  }, [objects]);

  const primaryGroup = primaryId ? (groupMap[primaryId] ?? null) : null;
  const primaryObject = primaryId
    ? objects.find((object) => object.id === primaryId)
    : null;
  const canTransformPrimary =
    Boolean(primaryGroup) && isCanvasReadyObject(primaryObject);
  const transformableSelectedIds = useMemo(() => {
    const objectMap = new Map(objects.map((object) => [object.id, object]));
    return new Set(
      [...selectedIds].filter((id) => isCanvasReadyObject(objectMap.get(id))),
    );
  }, [objects, selectedIds]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      {rootIds.map((id) => (
        <SceneObject
          key={id}
          objectId={id}
          childIds={childrenMap.get(id) ?? []}
          isSelected={selectedIds.has(id)}
          isPrimary={id === primaryId}
          onSelect={onSelect}
          onGroupReady={handleGroupReady}
          allSelectedIds={selectedIds}
          allPrimaryId={primaryId}
          allChildrenMap={childrenMap}
          onGroupReadyMap={handleGroupReady}
        />
      ))}
      {primaryId && canTransformPrimary && selectedIds.size === 1 && (
        <SelectedObjectControls
          key={primaryId}
          objectId={primaryId}
          groupObject={primaryGroup!}
          transformMode={transformMode}
          axisConstraint={axisConstraint}
        />
      )}
      {transformableSelectedIds.size > 1 && (
        <GroupTransformControls
          selectedIds={transformableSelectedIds}
          groupMap={groupMap}
          transformMode={transformMode}
          axisConstraint={axisConstraint}
        />
      )}
      <Grid
        infiniteGrid
        cellSize={0.01}
        sectionSize={0.1}
        cellColor="#333333"
        sectionColor="#555555"
        fadeDistance={2}
      />
      <CameraSync />
    </>
  );
}

// ---------------------------------------------------------------------------
// ConnectionStatus — shows sync state
// ---------------------------------------------------------------------------

function ConnectionStatus() {
  const { connected, synced } = useYjs();

  let color = "bg-yellow-500";
  let label = "Connecting";

  if (connected && synced) {
    color = "bg-green-500";
    label = "Synced";
  }

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-neutral-400">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SceneCanvas — main component
// ---------------------------------------------------------------------------

type SceneCanvasProps = {
  sceneName: string;
  sceneId: string;
};

export default function SceneCanvas({ sceneName, sceneId }: SceneCanvasProps) {
  const levaStore = useCreateStore();
  const { undoManager } = useYjs();
  const { readCamera } = useYjsCamera();

  // Selection state
  const [selectedIdsState, setSelectedIdsState] = useState<Set<string>>(
    new Set(),
  );
  const [primaryIdState, setPrimaryIdState] = useState<string | null>(null);
  const [transformMode, setTransformMode] =
    useState<TransformMode>("translate");
  const [axisConstraint, setAxisConstraint] = useState<AxisConstraint>("none");

  // Flat ordering of object IDs for shift-range selection (tree DFS order)
  const objects = useYjsObjects();
  const objectIdSet = useMemo(
    () => new Set(objects.map((object) => object.id)),
    [objects],
  );
  const selectedIds = useMemo(() => {
    const pruned = [...selectedIdsState].filter((id) => objectIdSet.has(id));
    return pruned.length === selectedIdsState.size
      ? selectedIdsState
      : new Set(pruned);
  }, [objectIdSet, selectedIdsState]);
  const primaryId = useMemo(() => {
    if (primaryIdState && objectIdSet.has(primaryIdState)) return primaryIdState;
    return selectedIds.values().next().value ?? null;
  }, [objectIdSet, primaryIdState, selectedIds]);
  const flatObjectOrder = useMemo(() => {
    const nodeMap = new Map<
      string,
      { id: string; parentId?: string; children: string[] }
    >();
    for (const obj of objects) {
      nodeMap.set(obj.id, { id: obj.id, parentId: obj.parentId, children: [] });
    }
    const roots: string[] = [];
    for (const obj of objects) {
      if (obj.parentId && nodeMap.has(obj.parentId)) {
        nodeMap.get(obj.parentId)!.children.push(obj.id);
      } else {
        roots.push(obj.id);
      }
    }
    const flat: string[] = [];
    const dfs = (id: string) => {
      flat.push(id);
      const node = nodeMap.get(id);
      if (node) for (const child of node.children) dfs(child);
    };
    for (const root of roots) dfs(root);
    return flat;
  }, [objects]);

  const handleSelect = useCallback(
    (id: string, modifiers: { shiftKey: boolean; ctrlKey: boolean }) => {
      const { shiftKey, ctrlKey } = modifiers;

      if (ctrlKey) {
        setSelectedIdsState((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
            setPrimaryIdState((p) => (p === id ? ([...next].pop() ?? null) : p));
          } else {
            next.add(id);
            setPrimaryIdState(id);
          }
          return next;
        });
      } else if (shiftKey) {
        const anchor = primaryId;
        if (!anchor || anchor === id) {
          setPrimaryIdState(id);
          setSelectedIdsState(new Set([id]));
          return;
        }
        const anchorIdx = flatObjectOrder.indexOf(anchor);
        const targetIdx = flatObjectOrder.indexOf(id);
        if (anchorIdx === -1 || targetIdx === -1) {
          setPrimaryIdState(id);
          setSelectedIdsState(new Set([id]));
          return;
        }
        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const rangeIds = flatObjectOrder.slice(start, end + 1);
        setSelectedIdsState(new Set(rangeIds));
      } else {
        setSelectedIdsState(new Set([id]));
        setPrimaryIdState(id);
      }
    },
    [primaryId, flatObjectOrder],
  );

  const handleDeselectAll = useCallback(() => {
    setSelectedIdsState(new Set());
    setPrimaryIdState(null);
  }, []);

  const batchDelete = useYjsBatchDelete();

  const cam = readCamera();
  const activeCamera =
    cam && !isSameCamera(cam, LEGACY_METER_SCALE_CAMERA) ? cam : DEFAULT_CAMERA;
  const cameraPosition: [number, number, number] = [
    activeCamera.px,
    activeCamera.py,
    activeCamera.pz,
  ];

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Undo/Redo
      if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoManager.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === "z" && e.shiftKey) {
        e.preventDefault();
        undoManager.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === "y") {
        e.preventDefault();
        undoManager.redo();
        return;
      }

      // Skip shortcuts when typing in inputs
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Transform mode shortcuts (only when something is selected)
      if (selectedIds.size > 0) {
        if (key === "g") {
          setTransformMode("translate");
          setAxisConstraint("none");
          return;
        }
        if (key === "s") {
          setTransformMode("scale");
          setAxisConstraint("none");
          return;
        }
        if (key === "r") {
          setTransformMode("rotate");
          setAxisConstraint("none");
          return;
        }
        if (key === "x") {
          setAxisConstraint((prev) => (prev === "x" ? "none" : "x"));
          return;
        }
        if (key === "y") {
          setAxisConstraint((prev) => (prev === "y" ? "none" : "y"));
          return;
        }
        if (key === "z") {
          setAxisConstraint((prev) => (prev === "z" ? "none" : "z"));
          return;
        }
        if (key === "delete" || key === "backspace") {
          batchDelete([...selectedIds]);
          handleDeselectAll();
          return;
        }
      }

      if (e.key === "Escape") {
        handleDeselectAll();
        return;
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [undoManager, selectedIds, batchDelete, handleDeselectAll]);

  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(300);
  const chatDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onChatResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    chatDragRef.current = { startX: e.clientX, startWidth: chatWidth };
    const onMove = (ev: MouseEvent) => {
      if (!chatDragRef.current) return;
      const delta = chatDragRef.current.startX - ev.clientX;
      const next = Math.min(600, Math.max(300, chatDragRef.current.startWidth + delta)); // min = default
      setChatWidth(next);
    };
    const onUp = () => {
      chatDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [chatWidth]);

  return (
    <LevaStoreProvider store={levaStore}>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col h-full relative">
        <SceneTopBar sceneName={sceneName} sceneId={sceneId} />

        <div className="flex-1 min-h-0 flex flex-row overflow-hidden">

          {/* Left panel — scene tree */}
          <div className={cn("h-full shrink-0 transition-all duration-200 overflow-hidden", treeCollapsed ? "w-12" : "w-56")}>
            <SceneObjectTree
              selectedIds={selectedIds}
              primaryId={primaryId}
              onSelect={handleSelect}
              onDeselectAll={handleDeselectAll}
              collapsed={treeCollapsed}
              onCollapse={setTreeCollapsed}
            />
          </div>

          {/* Canvas — fills remaining space */}
          <div className="flex-1 min-w-0 relative bg-black">
            <Canvas
              camera={{
                position: cameraPosition,
                fov: 50,
                near: 0.001,
                far: 100,
              }}
              onPointerMissed={() => handleDeselectAll()}
            >
              <SceneContent
                selectedIds={selectedIds}
                primaryId={primaryId}
                onSelect={handleSelect}
                transformMode={transformMode}
                axisConstraint={axisConstraint}
              />
            </Canvas>
            {selectedIds.size === 1 && primaryId && (
              <div className="absolute top-2 right-2">
                <LevaPanel store={levaStore} fill flat titleBar={false} />
              </div>
            )}
            {/* Keyboard shortcut hint */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 text-xs text-white/50 select-none pointer-events-none">
              {[
                { key: "G", label: "Move" },
                { key: "S", label: "Scale" },
                { key: "R", label: "Rotate" },
              ].map(({ key, label }) => (
                <span key={key} className="flex items-center gap-1">
                  <kbd className="font-mono font-semibold text-white/70">{key}</kbd>
                  <span>{label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Right panel — AI chat */}
          {!chatCollapsed && (
            <div
              className="w-1 h-full shrink-0 cursor-col-resize bg-transparent hover:bg-white/10 transition-colors"
              onMouseDown={onChatResizeStart}
            />
          )}
          <div
            className={cn("h-full shrink-0 overflow-hidden", chatCollapsed ? "w-12" : "transition-none")}
            style={chatCollapsed ? undefined : { width: chatWidth }}
          >
            <AiChatBox
              key={sceneId}
              sceneId={sceneId}
              collapsed={chatCollapsed}
              onCollapse={setChatCollapsed}
              selectedIds={selectedIds}
              primaryId={primaryId}
            />
          </div>

        </div>
      </div>
    </LevaStoreProvider>
  );
}
