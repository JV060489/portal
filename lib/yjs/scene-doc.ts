import * as Y from "yjs";
import {
  type SceneStateJSON,
  type SceneObjectData,
  type CameraData,
  type SceneMeta,
  type OldSceneState,
  sceneStateSchema,
  DEFAULT_SCENE_STATE,
  DEFAULT_CUBE_ID,
  DEFAULT_META,
  DEFAULT_CAMERA,
  DEFAULT_CUBE,
} from "./types";

// ---------------------------------------------------------------------------
// migrateOldState — convert old { camera, cube } format to new schema
// ---------------------------------------------------------------------------

export function migrateOldState(
  oldData: OldSceneState | Record<string, unknown>
): SceneStateJSON {
  const old = oldData as OldSceneState;

  const camPos = old.camera?.position ?? [
    DEFAULT_CAMERA.px,
    DEFAULT_CAMERA.py,
    DEFAULT_CAMERA.pz,
  ];
  const camTarget = old.camera?.target ?? [
    DEFAULT_CAMERA.tx,
    DEFAULT_CAMERA.ty,
    DEFAULT_CAMERA.tz,
  ];
  const cubePos = old.cube?.position ?? [
    DEFAULT_CUBE.px,
    DEFAULT_CUBE.py,
    DEFAULT_CUBE.pz,
  ];
  const cubeRot = old.cube?.rotation ?? [
    DEFAULT_CUBE.rx,
    DEFAULT_CUBE.ry,
    DEFAULT_CUBE.rz,
  ];
  const cubeScale = old.cube?.scale ?? [
    DEFAULT_CUBE.sx,
    DEFAULT_CUBE.sy,
    DEFAULT_CUBE.sz,
  ];

  return {
    meta: DEFAULT_META,
    camera: {
      px: camPos[0],
      py: camPos[1],
      pz: camPos[2],
      tx: camTarget[0],
      ty: camTarget[1],
      tz: camTarget[2],
    },
    objects: {
      [DEFAULT_CUBE_ID]: {
        type: "mesh",
        geometry: "box",
        name: "Cube",
        px: cubePos[0],
        py: cubePos[1],
        pz: cubePos[2],
        rx: cubeRot[0],
        ry: cubeRot[1],
        rz: cubeRot[2],
        sx: cubeScale[0],
        sy: cubeScale[1],
        sz: cubeScale[2],
        materialColor: "#4f8fff",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// initializeDoc — populate an empty Y.Doc from a SceneStateJSON
// ---------------------------------------------------------------------------

export function initializeDoc(doc: Y.Doc, state: SceneStateJSON): void {
  const scene = doc.getMap("scene");

  doc.transact(() => {
    // Meta
    const metaMap = new Y.Map<string>();
    metaMap.set("coordinateSpace", state.meta.coordinateSpace);
    metaMap.set("units", state.meta.units);
    scene.set("meta", metaMap);

    // Camera
    const cameraMap = new Y.Map<number>();
    const cam = state.camera;
    cameraMap.set("px", cam.px);
    cameraMap.set("py", cam.py);
    cameraMap.set("pz", cam.pz);
    cameraMap.set("tx", cam.tx);
    cameraMap.set("ty", cam.ty);
    cameraMap.set("tz", cam.tz);
    scene.set("camera", cameraMap);

    // Objects
    const objectsMap = new Y.Map<Y.Map<unknown>>();
    for (const [id, obj] of Object.entries(state.objects)) {
      const objMap = new Y.Map<unknown>();
      for (const [key, value] of Object.entries(obj)) {
        objMap.set(key, value);
      }
      objectsMap.set(id, objMap);
    }
    scene.set("objects", objectsMap);
  }, "server-init");
}

// ---------------------------------------------------------------------------
// docToJSON — export Y.Doc to plain JSON, validated via Zod
// Returns null if validation fails (corrupted doc).
// ---------------------------------------------------------------------------

export function docToJSON(doc: Y.Doc): SceneStateJSON | null {
  const scene = doc.getMap("scene");

  const metaMap = scene.get("meta") as Y.Map<string> | undefined;
  const cameraMap = scene.get("camera") as Y.Map<number> | undefined;
  const objectsMap = scene.get("objects") as
    | Y.Map<Y.Map<unknown>>
    | undefined;

  if (!cameraMap || !objectsMap) {
    return null;
  }

  if (!metaMap) {
    console.debug("[scene-doc] meta map missing, using DEFAULT_META");
  }
  const meta: SceneMeta = {
    coordinateSpace:
      metaMap?.get("coordinateSpace") ?? DEFAULT_META.coordinateSpace,
    units: metaMap?.get("units") ?? DEFAULT_META.units,
  };

  const camera: CameraData = {
    px: cameraMap.get("px") ?? DEFAULT_CAMERA.px,
    py: cameraMap.get("py") ?? DEFAULT_CAMERA.py,
    pz: cameraMap.get("pz") ?? DEFAULT_CAMERA.pz,
    tx: cameraMap.get("tx") ?? DEFAULT_CAMERA.tx,
    ty: cameraMap.get("ty") ?? DEFAULT_CAMERA.ty,
    tz: cameraMap.get("tz") ?? DEFAULT_CAMERA.tz,
  };

  const objects: Record<string, SceneObjectData> = {};
  objectsMap.forEach((objMap, id) => {
    objects[id] = {
      type: (objMap.get("type") as string) ?? "mesh",
      geometry: (objMap.get("geometry") as string) ?? "box",
      name: (objMap.get("name") as string) ?? "Object",
      px: (objMap.get("px") as number) ?? 0,
      py: (objMap.get("py") as number) ?? 0,
      pz: (objMap.get("pz") as number) ?? 0,
      rx: (objMap.get("rx") as number) ?? 0,
      ry: (objMap.get("ry") as number) ?? 0,
      rz: (objMap.get("rz") as number) ?? 0,
      sx: (objMap.get("sx") as number) ?? 1,
      sy: (objMap.get("sy") as number) ?? 1,
      sz: (objMap.get("sz") as number) ?? 1,
      materialColor: (objMap.get("materialColor") as string) ?? "#ffffff",
    };
  });

  const raw = { meta, camera, objects };

  const result = sceneStateSchema.safeParse(raw);
  if (!result.success) {
    console.error(
      "[scene-doc] Y.Doc produced invalid JSON, refusing to export:",
      result.error
    );
    return null;
  }

  return result.data;
}

// ---------------------------------------------------------------------------
// isDocEmpty — check if a Y.Doc has been initialized
// ---------------------------------------------------------------------------

export function isDocEmpty(doc: Y.Doc): boolean {
  const scene = doc.getMap("scene");
  return scene.size === 0;
}
