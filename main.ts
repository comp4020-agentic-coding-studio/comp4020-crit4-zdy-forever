// Your prototype's TypeScript goes here. If the week's spec rules out
// JavaScript, delete this file and the script tag in index.html — the site
// you ship has to meet the spec, not the template's defaults.
import * as THREE from "three";

const intro = document.querySelector<HTMLElement>('[data-testid="intro"]');
if (intro) {
  intro.dataset.ready = "true";
}

// Smoke test proving the Three.js pipeline builds and renders — replace with
// the actual instrument. This spinning cube isn't an instrument: it doesn't
// make sound and nothing about it responds to a player.
const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  camera.position.z = 3;

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshNormalMaterial(),
  );
  scene.add(cube);

  const resize = () => {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const animate = () => {
    cube.rotation.x += 0.01;
    cube.rotation.y += 0.015;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  };
  animate();
}
