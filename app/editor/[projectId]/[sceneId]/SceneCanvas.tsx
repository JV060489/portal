"use client"

import { Canvas, useThree, useFrame } from "@react-three/fiber"
import { Grid, OrbitControls, TransformControls } from "@react-three/drei"
import { useRef, useState, useCallback, useEffect } from "react"
import { useControls, useStoreContext, LevaPanel, LevaStoreProvider, useCreateStore } from "leva"
import * as THREE from "three"

type Vec3 = [number, number, number]

type SceneState = {
    camera: { position: Vec3; target: Vec3 }
    cube: { position: Vec3; rotation: Vec3; scale: Vec3 }
}

const DEFAULT_STATE: SceneState = {
    camera: { position: [5, 4, 5], target: [0, 0, 0] },
    cube: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
}

function parseInitialData(data: Record<string, unknown>): SceneState {
    const d = data as Partial<SceneState>
    return {
        camera: {
            position: d.camera?.position ?? DEFAULT_STATE.camera.position,
            target: d.camera?.target ?? DEFAULT_STATE.camera.target,
        },
        cube: {
            position: d.cube?.position ?? DEFAULT_STATE.cube.position,
            rotation: d.cube?.rotation ?? DEFAULT_STATE.cube.rotation,
            scale: d.cube?.scale ?? DEFAULT_STATE.cube.scale,
        },
    }
}

function toDeg(rad: number) { return rad * (180 / Math.PI) }
function toRad(deg: number) { return deg * (Math.PI / 180) }

function CameraSync({
    onCameraChange,
    initialTarget,
    cameraRef,
    orbitTargetRef,
}: {
    onCameraChange: () => void
    initialTarget: Vec3
    cameraRef: React.RefObject<THREE.Camera | null>
    orbitTargetRef: React.RefObject<THREE.Vector3 | null>
}) {
    const { camera } = useThree()
    const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null)

    useEffect(() => {
        cameraRef.current = camera
    }, [camera, cameraRef])

    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.target.set(...initialTarget)
            controlsRef.current.update()
            orbitTargetRef.current = controlsRef.current.target
        }
    }, [initialTarget, orbitTargetRef])

    return (
        <OrbitControls
            ref={controlsRef}
            makeDefault
            onEnd={onCameraChange}
        />
    )
}

function CubeWithControls({
    initialPosition,
    initialRotation,
    initialScale,
    onTransformChange,
    meshRef,
}: {
    initialPosition: Vec3
    initialRotation: Vec3
    initialScale: Vec3
    onTransformChange: () => void
    meshRef: React.RefObject<THREE.Mesh | null>
}) {
    const [meshObject, setMeshObject] = useState<THREE.Mesh | null>(null)
    const store = useStoreContext()
    const isDragging = useRef(false)

    const setRefs = useCallback((node: THREE.Mesh | null) => {
        meshRef.current = node
        setMeshObject(node)
    }, [meshRef])

    // Leva controls for cube transform
    const [, set] = useControls("Cube", () => ({
        position: {
            value: { x: initialPosition[0], y: initialPosition[1], z: initialPosition[2] },
            step: 0.1,
            onChange: (v: { x: number; y: number; z: number }) => {
                const mesh = meshRef.current
                if (!mesh || isDragging.current) return
                mesh.position.set(v.x, v.y, v.z)
                onTransformChange()
            },
        },
        rotation: {
            value: { x: toDeg(initialRotation[0]), y: toDeg(initialRotation[1]), z: toDeg(initialRotation[2]) },
            step: 1,
            onChange: (v: { x: number; y: number; z: number }) => {
                const mesh = meshRef.current
                if (!mesh || isDragging.current) return
                mesh.rotation.set(toRad(v.x), toRad(v.y), toRad(v.z))
                onTransformChange()
            },
        },
        scale: {
            value: { x: initialScale[0], y: initialScale[1], z: initialScale[2] },
            step: 0.1,
            min: 0.01,
            onChange: (v: { x: number; y: number; z: number }) => {
                const mesh = meshRef.current
                if (!mesh || isDragging.current) return
                mesh.scale.set(v.x, v.y, v.z)
                onTransformChange()
            },
        },
    }), { store })

    // Sync mesh transform back to leva after TransformControls drag
    useFrame(() => {
        const mesh = meshRef.current
        if (!mesh || !isDragging.current) return

        set({
            position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
            rotation: { x: toDeg(mesh.rotation.x), y: toDeg(mesh.rotation.y), z: toDeg(mesh.rotation.z) },
            scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
        })
    })

    return (
        <>
            <mesh
                ref={setRefs}
                position={initialPosition}
                rotation={initialRotation}
                scale={initialScale}
            >
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#4f8fff" />
            </mesh>
            {meshObject && (
                <TransformControls
                    object={meshObject}
                    onMouseDown={() => { isDragging.current = true }}
                    onMouseUp={() => {
                        isDragging.current = false
                        // Final sync to leva
                        const mesh = meshRef.current
                        if (mesh) {
                            set({
                                position: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
                                rotation: { x: toDeg(mesh.rotation.x), y: toDeg(mesh.rotation.y), z: toDeg(mesh.rotation.z) },
                                scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
                            })
                        }
                        onTransformChange()
                    }}
                />
            )}
        </>
    )
}

function SceneContent({
    sceneState,
    onDirty,
    cameraRef,
    orbitTargetRef,
    meshRef,
}: {
    sceneState: SceneState
    onDirty: () => void
    cameraRef: React.RefObject<THREE.Camera | null>
    orbitTargetRef: React.RefObject<THREE.Vector3 | null>
    meshRef: React.RefObject<THREE.Mesh | null>
}) {
    return (
        <>
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 10, 5]} intensity={0.8} />
            <CubeWithControls
                initialPosition={sceneState.cube.position}
                initialRotation={sceneState.cube.rotation}
                initialScale={sceneState.cube.scale}
                onTransformChange={onDirty}
                meshRef={meshRef}
            />
            <Grid
                infiniteGrid
                cellSize={1}
                sectionSize={5}
                cellColor="#333333"
                sectionColor="#555555"
                fadeDistance={30}
            />
            <CameraSync
                onCameraChange={onDirty}
                initialTarget={sceneState.camera.target}
                cameraRef={cameraRef}
                orbitTargetRef={orbitTargetRef}
            />
        </>
    )
}

type SceneCanvasProps = {
    sceneName: string
    projectId: string
    sceneId: string
    initialData: Record<string, unknown>
}

export default function SceneCanvas({ sceneName, projectId, sceneId, initialData }: SceneCanvasProps) {
    const [dirty, setDirty] = useState(false)
    const [saving, setSaving] = useState(false)
    const levaStore = useCreateStore()

    const cameraRef = useRef<THREE.Camera | null>(null)
    const orbitTargetRef = useRef<THREE.Vector3 | null>(null)
    const meshRef = useRef<THREE.Mesh | null>(null)

    const sceneState = parseInitialData(initialData)

    const markDirty = useCallback(() => setDirty(true), [])

    const handleSave = useCallback(async () => {
        const camera = cameraRef.current
        const mesh = meshRef.current
        const orbitTarget = orbitTargetRef.current
        if (!camera || !mesh) return

        setSaving(true)

        const globalData: SceneState = {
            camera: {
                position: camera.position.toArray() as Vec3,
                target: orbitTarget
                    ? (orbitTarget.toArray() as Vec3)
                    : [0, 0, 0],
            },
            cube: {
                position: mesh.position.toArray() as Vec3,
                rotation: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
                scale: mesh.scale.toArray() as Vec3,
            },
        }

        try {
            const res = await fetch(`/api/projects/${projectId}/scenes/${sceneId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ globalData }),
            })
            if (res.ok) setDirty(false)
        } finally {
            setSaving(false)
        }
    }, [projectId, sceneId])

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault()
                handleSave()
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [handleSave])

    return (
        <LevaStoreProvider store={levaStore}>
            <div className="flex-1 flex flex-col h-full relative">
                <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                    <h1 className="text-sm font-medium text-white">
                        {sceneName}
                        {dirty && <span className="text-yellow-400 ml-1">*</span>}
                    </h1>
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className={`
                            text-xs px-3 py-1 rounded-md transition-colors
                            ${dirty
                                ? "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer"
                                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                            }
                        `}
                    >
                        {saving ? "Saving..." : "Save"}
                    </button>
                </div>
                <div className="flex-1">
                    <Canvas
                        camera={{
                            position: sceneState.camera.position,
                            fov: 50,
                        }}
                    >
                        <SceneContent
                            sceneState={sceneState}
                            onDirty={markDirty}
                            cameraRef={cameraRef}
                            orbitTargetRef={orbitTargetRef}
                            meshRef={meshRef}
                        />
                    </Canvas>
                </div>
                <div className="absolute top-12 right-2">
                    <LevaPanel store={levaStore} fill flat titleBar={false} />
                </div>
            </div>
        </LevaStoreProvider>
    )
}
