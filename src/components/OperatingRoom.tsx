"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import Heart, { HeartState } from "./Heart";
import OperativeField from "./OperativeField";
import SurgicalDrape from "./SurgicalDrape";
import { loadHeartCloud, HeartCloud } from "@/lib/stlHeart";
import {
  Site,
  siteLabels,
  TAGLINE,
  GITHUB,
  LINKEDIN,
  EMAIL,
} from "@/data/content";

const HEART_TARGET_HEIGHT = 9.2;
const CAMERA_MARGIN = 1.05;

// Anchor targets in STL-local space (after recenter + scale to longest axis = HEART_TARGET_HEIGHT).
// Each will be snapped to nearest STL surface point.
const SITE_ANCHORS: { id: Site; anchor: THREE.Vector3 }[] = [
  { id: "projects", anchor: new THREE.Vector3(0.0, 1.0, 0.2) }, // top — great vessels / aortic arch
  { id: "achievements", anchor: new THREE.Vector3(-0.45, -1.0, 0.15) }, // bottom-left — LV apex
  { id: "positions", anchor: new THREE.Vector3(0.55, 0.05, 0.2) }, // mid-right — RA / right side
];

function snapToSurface(
  cloud: HeartCloud,
  anchor: THREE.Vector3,
  offsetAlongNormal = 0.04,
): [THREE.Vector3, THREE.Vector3] {
  const positions = cloud.geometry.attributes.position as THREE.BufferAttribute;
  const normals = cloud.geometry.attributes.aNormal as THREE.BufferAttribute;
  let bestI = 0;
  let bestD = Infinity;
  const p = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const d = p.distanceToSquared(anchor);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  const surface = new THREE.Vector3().fromBufferAttribute(positions, bestI);
  const normal = new THREE.Vector3()
    .fromBufferAttribute(normals, bestI)
    .normalize();
  surface.addScaledVector(normal, offsetAlongNormal);
  return [surface, normal];
}

function Marker({
  id,
  position,
  onSelect,
  dimmed,
}: {
  id: Site;
  position: THREE.Vector3;
  onSelect: (id: Site, worldPos: THREE.Vector3) => void;
  dimmed: boolean;
}) {
  const [hover, setHover] = useState(false);
  const group = useRef<THREE.Group>(null);

  return (
    <group ref={group} position={position}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          if (!dimmed) setHover(true);
        }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (dimmed) return;
          if (group.current) {
            const wp = new THREE.Vector3();
            group.current.getWorldPosition(wp);
            onSelect(id, wp);
          }
        }}
      >
        <sphereGeometry args={[0.55, 24, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
      <Html
        center
        distanceFactor={5.5}
        zIndexRange={[20, 0]}
        style={{
          opacity: dimmed ? 0.15 : 1,
          transition: "opacity 360ms ease",
          pointerEvents: "none",
        }}
      >
        <div className="pointer-events-none select-none relative w-16 h-16 flex items-center justify-center">
          {/* marker: dot + core ring + 3 staggered ripple rings; hidden on hover */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity: hover ? 0 : 1,
              transition: "opacity 220ms ease",
            }}
          >
            <div className="relative w-5 h-5">
              <div
                className="absolute inset-0 rounded-full border border-[#9ee6ee]"
                style={{
                  boxShadow:
                    "0 0 12px rgba(158,230,238,0.7), inset 0 0 4px rgba(158,230,238,0.5)",
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="w-1 h-1 rounded-full bg-[#cdf2f6]"
                  style={{ boxShadow: "0 0 6px #cdf2f6" }}
                />
              </div>
              <span className="ripple-ring d1" />
              <span className="ripple-ring d2" />
              <span className="ripple-ring d3" />
            </div>
          </div>

          {/* label: shown only on hover, in same spot */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity: hover ? 1 : 0,
              transition: "opacity 220ms ease",
            }}
          >
            <span
              className="whitespace-nowrap"
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.66rem",
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "#cdf2f6",
                textShadow: "0 0 10px rgba(158,230,238,0.6)",
              }}
            >
              {siteLabels[id]}
            </span>
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
    const aspect = size.width / size.height;
    const heartHeight = HEART_TARGET_HEIGHT;
    const heartWidth = HEART_TARGET_HEIGHT * 0.7;
    const fovRad = (persp.fov * Math.PI) / 180;
    const distForHeight = heartHeight / (2 * Math.tan(fovRad / 2));
    const horizontalFov = 2 * Math.atan(Math.tan(fovRad / 2) * aspect);
    const distForWidth = heartWidth / (2 * Math.tan(horizontalFov / 2));
    const target = Math.max(distForHeight, distForWidth) * CAMERA_MARGIN;
    // start at anterior view (camera on +X axis, looking at heart center)
    camera.position.set(target, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function SceneInner({
  cloud,
  markers,
  onSelect,
  heartStateRef,
  dimmed,
}: {
  cloud: HeartCloud;
  markers: { id: Site; position: THREE.Vector3 }[];
  onSelect: (id: Site, worldPos: THREE.Vector3) => void;
  heartStateRef: React.RefObject<HeartState>;
  dimmed: boolean;
}) {
  const { camera, mouse } = useThree();
  const tmpPlane = useRef(
    new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
  );
  const tmpRay = useRef(new THREE.Raycaster());
  const tmpMouseWorld = useRef(new THREE.Vector3());

  useFrame(() => {
    tmpRay.current.setFromCamera(mouse, camera);
    // plane facing the camera, passing through heart center
    const planeNormal = new THREE.Vector3();
    camera.getWorldDirection(planeNormal).negate();
    tmpPlane.current.setFromNormalAndCoplanarPoint(
      planeNormal,
      new THREE.Vector3(0, 0, 0),
    );
    const hit = new THREE.Vector3();
    if (tmpRay.current.ray.intersectPlane(tmpPlane.current, hit)) {
      tmpMouseWorld.current.copy(hit);
    }

    const state = heartStateRef.current;
    if (state) {
      state.mouseWorld.copy(tmpMouseWorld.current);
      state.mouseActive =
        dimmed ? 0 : tmpMouseWorld.current.length() < 1.6 ? 1 : 0;
      state.dim = dimmed ? 1 : 0;
    }
  });

  return (
    <>
      <ambientLight intensity={0.15} color="#3a4a55" />
      <Heart cloud={cloud} state={heartStateRef} />
      {markers.map((m) => (
        <Marker
          key={m.id}
          id={m.id}
          position={m.position}
          onSelect={onSelect}
          dimmed={dimmed}
        />
      ))}
    </>
  );
}

export default function OperatingRoom() {
  const [selected, setSelected] = useState<Site | null>(null);
  const [opened, setOpened] = useState(false);
  const [cloud, setCloud] = useState<HeartCloud | null>(null);
  const [markers, setMarkers] = useState<
    { id: Site; position: THREE.Vector3 }[] | null
  >(null);
  const heartStateRef = useRef<HeartState>({
    mouseWorld: new THREE.Vector3(0, 0, 100),
    mouseActive: 0,
    dim: 0,
  });
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const cameraHome = useRef(new THREE.Vector3(0, 0, 5));

  useEffect(() => {
    let cancelled = false;
    loadHeartCloud("/heart.stl").then((c) => {
      if (cancelled) return;
      setCloud(c);
      const placed = SITE_ANCHORS.map(({ id, anchor }) => {
        const [pos] = snapToSurface(c, anchor);
        return { id, position: pos };
      });
      setMarkers(placed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = (id: Site, worldPos: THREE.Vector3) => {
    setSelected(id);
    const cam = cameraRef.current;
    if (cam) {
      cameraHome.current.copy(cam.position);
      const dir = worldPos.clone().normalize();
      const target = worldPos.clone().add(dir.multiplyScalar(0.7));
      target.z = Math.max(target.z, 1.8);
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
    <div className="fixed inset-0 z-10">
      <SurgicalDrape />
      <div
        className="absolute top-6 left-6 z-30 liquid-glass opacity-95"
        style={{
          padding: "18px 26px",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "1rem",
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: "color-mix(in oklab, var(--od-blue) 75%, white)",
        }}
      >
        <span className="text-[var(--od-blue)]">●</span> OR · 04 LIVE
      </div>

      <div
        className="absolute top-6 right-6 z-30 liquid-glass text-right max-w-[460px] font-mono text-[var(--bone)]"
        style={{ padding: "22px 28px" }}
      >
        <div className="text-[0.95rem] tracking-[0.22em] uppercase opacity-65 mb-3.5">
          PATIENT · MOUNISH MAVUDURU
        </div>
        <div className="text-[1.05rem] leading-snug opacity-85 tracking-[0.02em] mb-3.5">
          {TAGLINE}
        </div>
        <div className="flex items-center justify-end gap-3 text-[1rem] tracking-[0.02em] opacity-80">
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--od-blue-hot)] transition-colors"
          >
            GitHub
          </a>
          <span className="opacity-40">·</span>
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--od-blue-hot)] transition-colors"
          >
            LinkedIn
          </a>
          <span className="opacity-40">·</span>
          <a
            href={`mailto:${EMAIL}`}
            className="hover:text-[var(--od-blue-hot)] transition-colors"
          >
            Email
          </a>
        </div>
      </div>

      <div
        className="absolute bottom-6 left-6 z-30 liquid-glass opacity-95"
        style={{
          padding: "18px 26px",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "1rem",
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: "color-mix(in oklab, var(--od-blue) 75%, white)",
        }}
      >
        DRAG TO ROTATE · 3 SITES MARKED
      </div>
      <div
        className="absolute bottom-6 right-6 z-30 liquid-glass opacity-95 text-right"
        style={{
          padding: "18px 26px",
          fontFamily: "var(--font-mono), monospace",
          fontSize: "1rem",
          letterSpacing: "0.26em",
          textTransform: "uppercase",
          color: "color-mix(in oklab, var(--od-blue) 75%, white)",
          lineHeight: 1.5,
        }}
      >
        SCALPEL · #10 BLADE
        <br />
        <span className="opacity-70">CLICK A SITE TO INCISE</span>
      </div>

      <Canvas
        camera={{ position: [0, 0, 5], fov: 35 }}
        onCreated={({ camera }) => {
          cameraRef.current = camera as THREE.PerspectiveCamera;
          cameraHome.current.copy(camera.position);
        }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]}
        style={{ position: "relative", zIndex: 10 }}
      >
        <CameraFit />
        {selected === null && (
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.85}
            autoRotate
            autoRotateSpeed={1.5}
            minPolarAngle={Math.PI * 0.18}
            maxPolarAngle={Math.PI * 0.82}
          />
        )}
        <Suspense fallback={null}>
          {cloud && markers && (
            <SceneInner
              cloud={cloud}
              markers={markers}
              heartStateRef={heartStateRef}
              dimmed={selected !== null}
              onSelect={handleSelect}
            />
          )}
        </Suspense>
      </Canvas>

      {selected && (
        <OperativeField site={selected} open={opened} onClose={handleClose} />
      )}
    </div>
  );
}
