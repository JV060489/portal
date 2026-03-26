import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Zod schemas — single source of truth for the scene JSON shape.
// TypeScript types are inferred from these schemas below.
// ---------------------------------------------------------------------------

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const cameraDataSchema = z.object({
  px: z.number(),
  py: z.number(),
  pz: z.number(),
  tx: z.number(),
  ty: z.number(),
  tz: z.number(),
});

export const sceneObjectDataSchema = z.object({
  type: z.string(), // "mesh"
  geometry: z.string(), // "box", "sphere", etc.
  name: z.string(),
  px: z.number(),
  py: z.number(),
  pz: z.number(),
  rx: z.number(),
  ry: z.number(),
  rz: z.number(),
  sx: z.number(),
  sy: z.number(),
  sz: z.number(),
  materialColor: z.string(),
  parentId: z.string().optional(),
});

export const sceneMetaSchema = z.object({
  coordinateSpace: z.string(),
  units: z.string(),
});

export const sceneStateSchema = z.object({
  meta: sceneMetaSchema,
  camera: cameraDataSchema,
  objects: z.record(z.string(), sceneObjectDataSchema),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript types
// ---------------------------------------------------------------------------

export type Vec3 = z.infer<typeof vec3Schema>;
export type CameraData = z.infer<typeof cameraDataSchema>;
export type SceneObjectData = z.infer<typeof sceneObjectDataSchema>;
export type SceneMeta = z.infer<typeof sceneMetaSchema>;
export type SceneStateJSON = z.infer<typeof sceneStateSchema>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_META: SceneMeta = {
  coordinateSpace: "right-handed-y-up",
  units: "meters",
};

export const DEFAULT_CAMERA: CameraData = {
  px: 5,
  py: 4,
  pz: 5,
  tx: 0,
  ty: 0,
  tz: 0,
};

export const DEFAULT_CUBE_ID = "default-cube";

export const DEFAULT_CUBE: SceneObjectData = {
  type: "mesh",
  geometry: "box",
  name: "Cube",
  px: 0,
  py: 0.5,
  pz: 0,
  rx: 0,
  ry: 0,
  rz: 0,
  sx: 1,
  sy: 1,
  sz: 1,
  materialColor: "#4f8fff",
};

export const DEFAULT_SCENE_STATE: SceneStateJSON = {
  meta: DEFAULT_META,
  camera: DEFAULT_CAMERA,
  objects: { [DEFAULT_CUBE_ID]: DEFAULT_CUBE },
};

// ---------------------------------------------------------------------------
// Shape definitions — common to Three.js and Blender
// ---------------------------------------------------------------------------

export const SHAPES = [
  { geometry: "box",         label: "Box",         defaultName: "Cube" },
  { geometry: "sphere",      label: "Sphere",      defaultName: "Sphere" },
  { geometry: "cylinder",    label: "Cylinder",    defaultName: "Cylinder" },
  { geometry: "cone",        label: "Cone",        defaultName: "Cone" },
  { geometry: "torus",       label: "Torus",       defaultName: "Torus" },
  { geometry: "plane",       label: "Plane",       defaultName: "Plane" },
  { geometry: "circle",      label: "Circle",      defaultName: "Circle" },
  { geometry: "icosahedron", label: "Icosahedron", defaultName: "Icosphere" },
] as const;

export type ShapeGeometry = (typeof SHAPES)[number]["geometry"];

export function createDefaultObject(
  geometry: ShapeGeometry,
  name: string,
): SceneObjectData {
  return {
    type: "mesh",
    geometry,
    name,
    px: 0,
    py: 0.5,
    pz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
    materialColor: "#4f8fff",
  };
}

// ---------------------------------------------------------------------------
// Old format (pre-YJS) for migration
// ---------------------------------------------------------------------------

export interface OldSceneState {
  camera?: {
    position?: [number, number, number];
    target?: [number, number, number];
  };
  cube?: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
}
