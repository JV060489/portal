"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  OpenScadWorkerMessageType,
  type OpenScadWorkerRequest,
  type OpenScadWorkerResponse,
} from "./worker-types";
import { localBoundsFromGeometry } from "@/lib/scene/bounds";
import type { LocalBounds } from "@/lib/yjs/types";

const OPENSCAD_UNIT_TO_SCENE_UNIT = 0.001;

type OpenScadPreviewState = {
  key: string | null;
  geometry: THREE.BufferGeometry | null;
  bounds: LocalBounds | undefined;
  status: "idle" | "compiling" | "ready" | "error";
  error: string | null;
};

export function useOpenScadPreview(
  code: string | undefined,
  revision: number,
): OpenScadPreviewState {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<OpenScadPreviewState>({
    key: null,
    geometry: null,
    bounds: undefined,
    status: "idle",
    error: null,
  });

  useEffect(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("./worker.ts", import.meta.url), {
        type: "module",
      });
    }

    const worker = workerRef.current;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!code?.trim() || !workerRef.current) return;

    const compileKey = `${revision}:${code}`;
    const requestId = `${compileKey}:${Date.now()}`;
    const worker = workerRef.current;
    let cancelled = false;

    const handleMessage = (event: MessageEvent<OpenScadWorkerResponse>) => {
      const message = event.data;
      if (message.id !== requestId) return;

      worker.removeEventListener("message", handleMessage);
      if (cancelled) return;

      if ("error" in message) {
        setState({
          key: compileKey,
          geometry: null,
          bounds: undefined,
          status: "error",
          error: message.error,
        });
        return;
      }

      try {
        const loader = new STLLoader();
        const geometry = loader.parse(message.data.output.slice().buffer);
        const position = geometry.getAttribute("position");

        if (!position || position.count === 0) {
          throw new Error("Generated STL did not contain any mesh vertices.");
        }

        transformOpenScadGeometryToSceneSpace(geometry);

        const scenePosition = geometry.getAttribute("position");
        if (!scenePosition || scenePosition.count === 0) {
          throw new Error(
            "Generated geometry became invalid after scene-space transform.",
          );
        }

        geometry.computeVertexNormals();
        const bounds = localBoundsFromGeometry(geometry);
        setState({
          key: compileKey,
          geometry,
          bounds,
          status: "ready",
          error: null,
        });
      } catch (parseError) {
        setState({
          key: compileKey,
          geometry: null,
          bounds: undefined,
          status: "error",
          error:
            parseError instanceof Error
              ? parseError.message
              : "Failed to parse generated STL.",
        });
      }
    };

    worker.addEventListener("message", handleMessage);
    const message: OpenScadWorkerRequest = {
      id: requestId,
      type: OpenScadWorkerMessageType.COMPILE,
      data: { code },
    };

    worker.postMessage(message);

    return () => {
      cancelled = true;
      worker.removeEventListener("message", handleMessage);
    };
  }, [code, revision]);

  if (!code?.trim()) {
    return {
      key: null,
      geometry: null,
      bounds: undefined,
      status: "idle",
      error: null,
    };
  }

  const activeKey = `${revision}:${code}`;
  if (state.key !== activeKey) {
    return {
      key: activeKey,
      geometry: null,
      bounds: undefined,
      status: "compiling",
      error: null,
    };
  }

  return state;
}

function transformOpenScadGeometryToSceneSpace(geometry: THREE.BufferGeometry) {
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(
    OPENSCAD_UNIT_TO_SCENE_UNIT,
    OPENSCAD_UNIT_TO_SCENE_UNIT,
    OPENSCAD_UNIT_TO_SCENE_UNIT,
  );

  geometry.computeBoundingBox();
  const boundingBox = geometry.boundingBox;
  if (!boundingBox) return;

  const offset = new THREE.Vector3(
    -(boundingBox.min.x + boundingBox.max.x) / 2,
    -boundingBox.min.y,
    -(boundingBox.min.z + boundingBox.max.z) / 2,
  );
  geometry.translate(offset.x, offset.y, offset.z);
  geometry.computeBoundingBox();
}
