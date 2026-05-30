/* eslint-disable react-hooks/immutability -- R3F mutates three.js camera/objects directly */
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import Heart, { HeartState } from "./Heart";
import OperativeField from "./OperativeField";
import { Site, siteLabels } from "@/data/content";

const SITES: { id: Site; pos: [number, number, number] }[] = [
  { id: "projects", pos: [0.6, 0.15, 0.95] },
  { id: "achievements", pos: [-0.7, 0.55, 0.5] },
  { id: "positions", pos: [0.15, -0.55, 0.9] },
];

function Marker({
  id,
  position,
  onSelect,
}: {
  id: Site;
  position: [number, number, number];
  onSelect: (id: Site, worldPos: THREE.Vector3) => void;
}) {
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);

  return (
    <group ref={group} position={position}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (group.current) {
            const wp = new THREE.Vector3();
            group.current.getWorldPosition(wp);
            onSelect(id, wp);
          }
        }}
      >
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} />
      </mesh>
      <Html center distanceFactor={4.5} zIndexRange={[20, 0]}>
        <div
          className="pointer-events-none select-none flex items-center gap-3"
          style={{
            transform: hover ? "translateX(8px)" : "translateX(0)",
            transition: "transform 280ms cubic-bezier(.16,.84,.32,1)",
          }}
        >
          <div className="relative">
            <div
              className={`rounded-full border transition-all duration-300 ${
                hover
                  ? "border-[#9ee6ee] w-7 h-7 marker-pulse-fast"
                  : "border-[#6fb8c0] w-4 h-4 marker-pulse"
              }`}
              style={{
                boxShadow: hover
                  ? "0 0 22px rgba(158,230,238,0.9), inset 0 0 8px rgba(158,230,238,0.5)"
                  : "0 0 8px rgba(111,184,192,0.5)",
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className={`rounded-full transition-all duration-300 ${
                  hover ? "w-1 h-1 bg-[#cdf2f6]" : "w-[2px] h-[2px] bg-[#9ec9cd]"
                }`}
                style={{
                  boxShadow: hover ? "0 0 6px #cdf2f6" : "0 0 3px #9ec9cd",
                }}
              />
            </div>
          </div>
          <div
            className="hud-text whitespace-nowrap overflow-hidden"
            style={{
              maxWidth: hover ? "200px" : "0",
              opacity: hover ? 1 : 0,
              color: "#cdf2f6",
              fontSize: "0.62rem",
              letterSpacing: "0.32em",
              transition:
                "max-width 320ms cubic-bezier(.16,.84,.32,1), opacity 220ms ease",
            }}
          >
            ▸ {siteLabels[id]}
          </div>
        </div>
      </Html>
    </group>
  );
}

function CameraFit() {
  const { camera, size } = useThree();
  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    // fit heart (~1.6 tall, ~1.4 wide after scale) with 24% margin
    const aspect = size.width / size.height;
    const heartHeight = 1.7;
    const heartWidth = 1.4;
    const fovRad = (persp.fov * Math.PI) / 180;
    const distForHeight = heartHeight / (2 * Math.tan(fovRad / 2));
    const horizontalFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
    const distForWidth = heartWidth / (2 * Math.tan(horizontalFov / 2));
    const target = Math.max(distForHeight, distForWidth) * 1.35;
    camera.position.z = target;
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function SceneInner({
  onSelect,
  heartStateRef,
  paused,
}: {
  onSelect: (id: Site, worldPos: THREE.Vector3) => void;
  heartStateRef: React.RefObject<HeartState>;
  paused: boolean;
}) {
  const { camera, mouse } = useThree();
  const planeNormal = useRef(new THREE.Vector3(0, 0, 1));
  const tmpPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
  const tmpRay = useRef(new THREE.Raycaster());
  const tmpMouseWorld = useRef(new THREE.Vector3());

  useFrame(() => {
    camera.lookAt(0, 0, 0);
    // unproject mouse to plane z=0
    tmpRay.current.setFromCamera(mouse, camera);
    tmpPlane.current.setFromNormalAndCoplanarPoint(
      planeNormal.current,
      new THREE.Vector3(0, 0, 0),
    );
    const hit = new THREE.Vector3();
    if (tmpRay.current.ray.intersectPlane(tmpPlane.current, hit)) {
      tmpMouseWorld.current.copy(hit);
    }

    const state = heartStateRef.current;
    if (state) {
      state.mouseWorld.copy(tmpMouseWorld.current);
      const dToHeart = tmpMouseWorld.current.length();
      const close = dToHeart < 1.2;
      state.mouseActive = close ? 1 : 0;
      // BPM 65 (resting) → 130 (close)
      const targetBpm = THREE.MathUtils.lerp(
        130,
        65,
        THREE.MathUtils.smoothstep(dToHeart, 0.0, 1.5),
      );
      state.bpm = THREE.MathUtils.lerp(state.bpm, targetBpm, 0.04);
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} color="#3a4a55" />
      <Heart state={heartStateRef} paused={paused} />
      {SITES.map((s) => (
        <Marker key={s.id} id={s.id} position={s.pos} onSelect={onSelect} />
      ))}
    </>
  );
}

export default function OperatingRoom() {
  const [selected, setSelected] = useState<Site | null>(null);
  const [opened, setOpened] = useState(false);
  const heartStateRef = useRef<HeartState>({
    mouseWorld: new THREE.Vector3(0, 0, 100),
    mouseActive: 0,
    bpm: 65,
  });
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraHome = useRef(new THREE.Vector3(0, 0, 4.5));

  const handleSelect = (id: Site, worldPos: THREE.Vector3) => {
    setSelected(id);
    const cam = cameraRef.current;
    if (cam) {
      cameraHome.current.copy(cam.position);
      const dir = worldPos.clone().normalize();
      const target = worldPos.clone().add(dir.multiplyScalar(0.9));
      target.z = Math.max(target.z, 1.6);
      gsap.to(cam.position, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: 1.1,
        ease: "power3.inOut",
        onComplete: () => setOpened(true),
      });
    } else {
      setOpened(true);
    }
  };

  const handleClose = () => {
    setOpened(false);
    const cam = cameraRef.current;
    if (cam) {
      gsap.to(cam.position, {
        x: cameraHome.current.x,
        y: cameraHome.current.y,
        z: cameraHome.current.z,
        duration: 0.95,
        ease: "power3.inOut",
        onComplete: () => setSelected(null),
      });
    } else {
      setSelected(null);
    }
  };

  return (
    <div className="fixed inset-0 z-10 or-vignette">
      <div className="absolute top-6 left-6 hud-text opacity-60 z-30">
        <span className="text-[var(--od-blue)]">●</span> OR · 04 LIVE
      </div>
      <div className="absolute top-6 right-6 hud-text opacity-60 z-30 text-right">
        PATIENT · M. MAVUDURU
        <br />
        <span className="opacity-70">
          <BpmDisplay state={heartStateRef} />
        </span>
      </div>
      <div className="absolute bottom-6 left-6 hud-text opacity-50 z-30">
        3 OPERATIVE SITES MARKED
      </div>
      <div className="absolute bottom-6 right-6 hud-text opacity-50 z-30 text-right">
        SCALPEL · #10 BLADE
        <br />
        <span className="opacity-60">CLICK A SITE TO INCISE</span>
      </div>

      <Canvas
        camera={{ position: [0, 0, 4.5], fov: 35 }}
        onCreated={({ camera }) => {
          cameraRef.current = camera as THREE.PerspectiveCamera;
          cameraHome.current.copy(camera.position);
        }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#07090a"]} />
        <CameraFit />
        <Suspense fallback={null}>
          <SceneInner
            heartStateRef={heartStateRef}
            paused={selected !== null}
            onSelect={handleSelect}
          />
        </Suspense>
      </Canvas>

      {selected && (
        <OperativeField site={selected} open={opened} onClose={handleClose} />
      )}
    </div>
  );
}

function BpmDisplay({ state }: { state: React.RefObject<HeartState> }) {
  const [bpm, setBpm] = useState(65);
  useEffect(() => {
    const id = setInterval(() => {
      if (state.current) setBpm(Math.round(state.current.bpm));
    }, 200);
    return () => clearInterval(id);
  }, [state]);
  return <span>BPM {bpm}</span>;
}
