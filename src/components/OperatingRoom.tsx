"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import Heart from "./Heart";
import OperativeField from "./OperativeField";
import { Site, siteLabels } from "@/data/content";

const SITES: { id: Site; pos: [number, number, number]; label: string }[] = [
  { id: "projects", pos: [0.55, 0.35, 0.95], label: siteLabels.projects },
  { id: "achievements", pos: [-0.65, 0.45, 0.85], label: siteLabels.achievements },
  { id: "positions", pos: [0.05, -0.45, 1.05], label: siteLabels.positions },
];

function Marker({
  id,
  position,
  label,
  onSelect,
}: {
  id: Site;
  position: [number, number, number];
  label: string;
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
          document.body.style.cursor = "none";
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
        <sphereGeometry args={[0.04, 16, 16]} />
        <meshBasicMaterial
          color={hover ? "#9ee6ee" : "#6fb8c0"}
          transparent
          opacity={0.0}
        />
      </mesh>
      <Html center distanceFactor={5} zIndexRange={[10, 0]}>
        <div
          className={`relative pointer-events-none select-none`}
          style={{ transform: "translate(-50%, -50%)" }}
        >
          <div
            className={`w-10 h-10 rounded-full border ${
              hover
                ? "border-[var(--od-blue-hot)] marker-pulse-fast"
                : "border-[var(--od-blue)] marker-pulse"
            }`}
            style={{
              boxShadow: hover
                ? "0 0 18px rgba(158, 230, 238, 0.85), inset 0 0 8px rgba(158, 230, 238, 0.4)"
                : "0 0 10px rgba(111, 184, 192, 0.45)",
            }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ color: hover ? "#cdf2f6" : "#9ec9cd" }}
          >
            <div className="w-[3px] h-[3px] rounded-full bg-current shadow-[0_0_6px_currentColor]" />
          </div>
          <div
            className="absolute left-1/2 top-full mt-2 -translate-x-1/2 hud-text whitespace-nowrap"
            style={{
              color: hover ? "#cdf2f6" : "rgba(206,232,236,0.65)",
              fontSize: "0.6rem",
              letterSpacing: "0.3em",
            }}
          >
            ▸ {label}
          </div>
        </div>
      </Html>
    </group>
  );
}

function SceneInner({
  onSelect,
  mouseRef,
  paused,
}: {
  onSelect: (id: Site, worldPos: THREE.Vector3) => void;
  mouseRef: React.RefObject<{ x: number; y: number }>;
  paused: boolean;
}) {
  const { camera } = useThree();
  useFrame(() => {
    // very subtle parallax (camera lookAt origin)
    camera.lookAt(0, 0, 0);
  });
  return (
    <>
      <ambientLight intensity={0.08} color="#3a4f55" />
      <spotLight
        position={[0, 6, 3]}
        angle={0.55}
        penumbra={0.7}
        intensity={120}
        distance={20}
        decay={2}
        color="#f6f1e0"
        castShadow
      />
      <pointLight position={[-4, 1, 2]} intensity={2.5} color="#6fb8c0" decay={2} />
      <pointLight position={[4, 0.5, -2]} intensity={1.8} color="#ff7a85" decay={2} />

      <group scale={1.6}>
        <Heart mouse={mouseRef} paused={paused} />
        {SITES.map((s) => (
          <Marker
            key={s.id}
            id={s.id}
            position={s.pos}
            label={s.label}
            onSelect={onSelect}
          />
        ))}
      </group>
    </>
  );
}

export default function OperatingRoom() {
  const [selected, setSelected] = useState<Site | null>(null);
  const [opened, setOpened] = useState(false);
  const mouseRef = useRef({ x: 0, y: 0 });
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const handleSelect = (id: Site, worldPos: THREE.Vector3) => {
    setSelected(id);
    const cam = cameraRef.current;
    if (cam) {
      const target = worldPos.clone().multiplyScalar(1.35);
      target.z += 1.6;
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
        x: 0,
        y: 0,
        z: 5,
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
      <div className="absolute top-6 right-6 hud-text opacity-60 z-30">
        PATIENT · M. MAVUDURU · DOB / —
      </div>
      <div className="absolute bottom-6 left-6 hud-text opacity-50 z-30">
        TARGETS · 3 SITES MARKED
      </div>
      <div className="absolute bottom-6 right-6 hud-text opacity-50 z-30 text-right">
        SCALPEL · #10 BLADE
        <br />
        <span className="opacity-60">CLICK A SITE TO INCISE</span>
      </div>

      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 38 }}
        onCreated={({ camera }) => {
          cameraRef.current = camera as THREE.PerspectiveCamera;
        }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#07090a"]} />
        <fog attach="fog" args={["#07090a", 6, 14]} />
        <Suspense fallback={null}>
          <SceneInner
            mouseRef={mouseRef}
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
