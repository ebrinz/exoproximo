"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Starfield } from "./Starfield";
import { Earth } from "./Earth";
import { EarthOrbit } from "./EarthOrbit";
import { NeoOrbits } from "./NeoOrbits";
import { NeoInstances } from "./NeoInstances";
import { SelectionHalo } from "./SelectionHalo";
import { TrajectoryArc } from "./TrajectoryArc";
import { CameraRig } from "./CameraRig";
import { Sun } from "./Sun";

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 45, near: 0.01, far: 5000 }}>
      <color attach="background" args={["#05070d"]} />
      <Starfield />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff5a0" />
      <Sun />
      <EarthOrbit />
      <NeoOrbits />
      <NeoInstances />
      <SelectionHalo />
      <TrajectoryArc />
      <Earth />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <CameraRig />
    </Canvas>
  );
}
