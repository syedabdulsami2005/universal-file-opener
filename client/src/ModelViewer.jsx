import React from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Stage, OrbitControls } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader";

const ModelViewer = ({ url }) => {
  try {
    const geom = useLoader(STLLoader, url);
    return (
      <Canvas camera={{ position: [0, 0, 100], fov: 50 }} className="h-full w-full">
        <Stage environment="city" intensity={0.6}>
          <mesh geometry={geom}>
            <meshStandardMaterial color="orange" />
          </mesh>
        </Stage>
        <OrbitControls autoRotate />
      </Canvas>
    );
  } catch (e) {
    return <div className="text-red-500 p-4">Error loading 3D model</div>;
  }
};

export default ModelViewer;