import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Zod schemas — single source of truth for the scene JSON shape.
// TypeScript types are inferred from these schemas below.
// ---------------------------------------------------------------------------

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const localBoundsSchema = z.object({
  min: vec3Schema,
  max: vec3Schema,
  size: vec3Schema,
  center: vec3Schema,
});

export const cameraDataSchema = z.object({
  px: z.number(),
  py: z.number(),
  pz: z.number(),
  tx: z.number(),
  ty: z.number(),
  tz: z.number(),
});

export const sceneObjectDataSchema = z.object({
  type: z.string(),
  geometry: z.string(),
  geometryKind: z.enum(["primitive", "generated"]).default("primitive"),
  sourceKind: z.enum(["openscad"]).optional(),
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
  localBounds: localBoundsSchema.optional(),
  boundsVersion: z.number().default(1),
  geometryRevision: z.number().default(1),
  openscadCode: z.string().optional(),
  generatedPrompt: z.string().optional(),
  compileStatus: z
    .enum(["idle", "compiling", "ready", "error"])
    .default("idle"),
  compileError: z.string().optional(),
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
export type LocalBounds = z.infer<typeof localBoundsSchema>;
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
  geometryKind: "primitive",
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
  localBounds: createLocalBounds([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
  boundsVersion: 1,
  geometryRevision: 1,
  compileStatus: "idle",
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
  { geometry: "box", label: "Box", defaultName: "Cube" },
  { geometry: "sphere", label: "Sphere", defaultName: "Sphere" },
  { geometry: "cylinder", label: "Cylinder", defaultName: "Cylinder" },
  { geometry: "cone", label: "Cone", defaultName: "Cone" },
  { geometry: "torus", label: "Torus", defaultName: "Torus" },
  { geometry: "plane", label: "Plane", defaultName: "Plane" },
  { geometry: "circle", label: "Circle", defaultName: "Circle" },
  { geometry: "icosahedron", label: "Icosahedron", defaultName: "Icosphere" },
] as const;

export type ShapeGeometry = (typeof SHAPES)[number]["geometry"];

const PRIMITIVE_LOCAL_BOUNDS: Record<ShapeGeometry, LocalBounds> = {
  box: createLocalBounds([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
  sphere: createLocalBounds([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
  cylinder: createLocalBounds([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
  cone: createLocalBounds([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
  torus: createLocalBounds([-0.7, -0.7, -0.2], [0.7, 0.7, 0.2]),
  plane: createLocalBounds([-0.5, 0, -0.5], [0.5, 0, 0.5]),
  circle: createLocalBounds([-0.5, 0, -0.5], [0.5, 0, 0.5]),
  icosahedron: createLocalBounds([-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
};

export function createDefaultObject(
  geometry: ShapeGeometry,
  name: string,
): SceneObjectData {
  return {
    type: "mesh",
    geometry,
    geometryKind: "primitive",
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
    localBounds: getPrimitiveLocalBounds(geometry),
    boundsVersion: 1,
    geometryRevision: 1,
    compileStatus: "idle",
  };
}

export function createLocalBounds(min: Vec3, max: Vec3): LocalBounds {
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ],
  };
}

export function getPrimitiveLocalBounds(geometry: ShapeGeometry): LocalBounds {
  return PRIMITIVE_LOCAL_BOUNDS[geometry];
}

export function createGeneratedObject(
  name: string,
  openscadCode: string,
  generatedPrompt: string,
): SceneObjectData {
  return {
    type: "mesh",
    geometry: "generated",
    geometryKind: "generated",
    sourceKind: "openscad",
    name,
    px: 0,
    py: 0,
    pz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    sx: 1,
    sy: 1,
    sz: 1,
    materialColor: "#4f8fff",
    boundsVersion: 1,
    geometryRevision: 1,
    openscadCode,
    generatedPrompt,
    compileStatus: "idle",
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
