"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

export function Scene() {
  return (
    <Canvas camera={{ position: [0, 5, 10], fov: 45, near: 0.01, far: 5000 }}>
      <color attach="background" args={["#05070d"]} />
      <ambientLight intensity={0.05} />
      <pointLight position={[0, 0, 0]} intensity={3} color="#fff5a0" />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#fff5a0" />
      </mesh>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </Canvas>
  );
}
