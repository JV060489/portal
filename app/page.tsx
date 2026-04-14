"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { Bot, SendHorizontal } from "lucide-react";
import { motion } from "framer-motion";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { useOpenScadPreview } from "@/lib/openscad/use-openscad-preview";

const GEAR_PROMPT =
  "Create one single-piece decorative mechanical gear plate with 28 simple teeth, 60mm outer diameter, 5mm thickness, 10mm center hole, and six large rounded triangular cutouts inside the disk. Keep all cutouts manifold and leave at least 4mm wall thickness.";

const GEAR_OPENSCAD_CODE = `$fn = 192;

tooth_count = 28;
outer_diameter = 60;
thickness = 5;
center_hole_diameter = 10;

root_diameter = 54;
tooth_tip_diameter = outer_diameter;

cutout_count = 6;
cutout_center_radius = 13.5;
cutout_corner_radius = 2.2;
cutout_outer_radius = 6.0;

module rounded_triangle_2d(r_outer, r_round) {
    offset(r = r_round)
        offset(delta = -r_round)
            polygon(points = [
                [ r_outer * cos(90),  r_outer * sin(90)],
                [ r_outer * cos(210), r_outer * sin(210)],
                [ r_outer * cos(330), r_outer * sin(330)]
            ]);
}

module gear_outline_2d() {
    union() {
        circle(d = root_diameter);
        for (i = [0 : tooth_count - 1]) {
            rotate(i * 360 / tooth_count)
                translate([root_diameter / 2, 0])
                    square(
                        [
                            (tooth_tip_diameter - root_diameter) / 2,
                            2 * PI * (root_diameter / 2) / tooth_count * 0.62
                        ],
                        center = true
                    );
        }
    }
}

difference() {
    linear_extrude(height = thickness)
        gear_outline_2d();

    translate([0, 0, -0.5])
        cylinder(h = thickness + 1, d = center_hole_diameter);

    for (i = [0 : cutout_count - 1]) {
        rotate(i * 360 / cutout_count)
            translate([cutout_center_radius, 0, -0.5])
                linear_extrude(height = thickness + 1)
                    rotate(90)
                        rounded_triangle_2d(cutout_outer_radius, cutout_corner_radius);
    }
}`;

type DemoPhase =
  | "empty"
  | "pasted"
  | "queued"
  | "compiling"
  | "ready"
  | "error";

function LandingGearDemo() {
  const [typedPrompt, setTypedPrompt] = useState("");
  const [scriptedPhase, setScriptedPhase] = useState<DemoPhase>("empty");
  const [showModel, setShowModel] = useState(false);
  const { geometry, status } = useOpenScadPreview(
    showModel ? GEAR_OPENSCAD_CODE : undefined,
    1,
  );
  const phase: DemoPhase = showModel
    ? status === "ready"
      ? "ready"
      : status === "error"
        ? "error"
        : "compiling"
    : scriptedPhase;

  useEffect(() => {
    const pasteTimer = setTimeout(() => {
      setTypedPrompt(GEAR_PROMPT);
      setScriptedPhase("pasted");
    }, 600);
    const sendTimer = setTimeout(() => {
      setScriptedPhase("queued");
    }, 1800);
    const generateTimer = setTimeout(() => {
      setShowModel(true);
      setScriptedPhase("compiling");
    }, 3800);

    return () => {
      clearTimeout(pasteTimer);
      clearTimeout(sendTimer);
      clearTimeout(generateTimer);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{
        duration: 1,
        delay: 0.22,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="min-h-[560px] overflow-hidden rounded-[8px] border border-white/10 bg-neutral-900"
    >
      <div className="grid h-full min-h-[560px] grid-rows-[minmax(320px,1fr)_auto] lg:grid-cols-[minmax(360px,1fr)_280px] lg:grid-rows-1">
        <DemoOrbitCanvas geometry={geometry} />
        <DemoChatBox typedPrompt={typedPrompt} phase={phase} />
      </div>
    </motion.div>
  );
}

function DemoOrbitCanvas({
  geometry,
}: {
  geometry: THREE.BufferGeometry | null;
}) {
  return (
    <section className="relative min-h-[320px] bg-black">
      <Canvas
        camera={{
          position: [0.12, 0.08, 0.12],
          fov: 50,
          near: 0.001,
          far: 100,
        }}
      >
        <ambientLight intensity={0.45} />
        <directionalLight position={[4, 8, 5]} intensity={1.2} />
        <directionalLight position={[-3, 4, -4]} intensity={0.35} />
        {geometry && <GearModel geometry={geometry} />}
        <Grid
          infiniteGrid
          cellSize={0.01}
          sectionSize={0.1}
          cellColor="#333333"
          sectionColor="#555555"
          fadeDistance={2}
        />
        <OrbitControls makeDefault minDistance={0.04} maxDistance={0.28} />
      </Canvas>
    </section>
  );
}

function GearModel({ geometry }: { geometry: THREE.BufferGeometry }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.35;
  });

  return (
    <group ref={groupRef} rotation={[0, 0.35, 0]} scale={1.25}>
      <mesh castShadow receiveShadow>
        <primitive object={geometry} attach="geometry" />
        <meshStandardMaterial
          color="#4f8fff"
          metalness={0.35}
          roughness={0.42}
        />
      </mesh>
    </group>
  );
}

function DemoChatBox({
  typedPrompt,
  phase,
}: {
  typedPrompt: string;
  phase: DemoPhase;
}) {
  const hasSent = phase !== "empty" && phase !== "pasted";
  const isWorking = phase === "queued" || phase === "compiling";

  return (
    <aside className="flex min-h-[260px] flex-col border-t border-white/10 bg-neutral-950/90 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
          <Bot className="h-4 w-4" />
          Assistant
        </div>
        <span className="rounded-[6px] border border-white/10 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400">
          Portal AI
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-3">
        {hasSent && (
          <div className="flex justify-end">
            <div className="max-w-[88%] rounded-[8px] bg-neutral-700 px-3 py-2 text-xs leading-relaxed text-neutral-100">
              {GEAR_PROMPT}
            </div>
          </div>
        )}
        {isWorking && (
          <div className="flex justify-start">
            <div className="rounded-[8px] bg-neutral-800 px-3 py-2 text-xs text-neutral-300">
              Generating gear plate...
            </div>
          </div>
        )}
        {phase === "ready" && (
          <div className="flex justify-start">
            <div className="max-w-[88%] rounded-[8px] bg-neutral-800 px-3 py-2 text-xs leading-relaxed text-neutral-200">
              Done. The gear plate is on the canvas.
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-3 pb-3 pt-2">
        <div className="flex items-end gap-2">
          <div className="min-h-20 flex-1 resize-none overflow-hidden rounded-[8px] border border-white/10 bg-neutral-800 px-3 py-2 text-xs leading-relaxed text-neutral-100">
            {hasSent || !typedPrompt ? (
              <span className="text-neutral-500">
                Generate or edit CAD models...
              </span>
            ) : (
              typedPrompt
            )}
          </div>
          <button
            type="button"
            aria-label="Send demo prompt"
            className="shrink-0 rounded-[8px] bg-neutral-700 p-2 text-neutral-200"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-black p-4 text-neutral-100 sm:p-6 lg:p-8">
      <div className="min-h-[calc(100vh-2rem)] w-full p-4 sm:min-h-[calc(100vh-3rem)] sm:p-6 lg:min-h-[calc(100vh-4rem)] lg:p-8">
        <motion.nav
          initial={{ opacity: 0, filter: "blur(10px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 gap-4 border-b border-neutral-800 pb-6 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
        >
          <div className="hidden sm:block" />
          <div className="text-center">
            <p className="text-4xl font-semibold sm:text-5xl">Portal</p>
          </div>
        </motion.nav>

        <section className="grid gap-8 py-8 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)] lg:items-center lg:py-10">
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 1,
                delay: 0.15,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="space-y-4"
            >
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
                Design CAD models with an AI co-pilot.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-neutral-400 sm:text-lg">
                Create, inspect, and refine 3D-printable models with an AI CAD workflow.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 1,
                delay: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex flex-wrap items-center gap-3"
            >
              <Button asChild size="lg" className="rounded-[8px] px-8">
                <Link href="/sign-up">Sign Up</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-[8px] border-neutral-700 bg-neutral-900 px-8 hover:bg-neutral-800"
              >
                <Link href="/sign-in">Sign In</Link>
              </Button>
            </motion.div>
          </div>

          <LandingGearDemo />
        </section>
      </div>
    </main>
  );
}
