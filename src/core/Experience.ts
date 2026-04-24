import * as THREE from "three";
import Camera from "./Camera";
import Renderer from "./Renderer";
import PostProcessing from "./PostProcessing";
import Debug from "../debug/Debug";
import Terrain from "../world/Terrain";
import Lighting from "../world/Lighting";
import SkyEnvironment from "../world/SkyEnvironment";
import Grass from "../world/Grass";
import Bushes from "../world/Bushes";
import Flowers from "../world/Flowers";
import Trees from "../world/Trees";
import Lake from "../world/Lake";
import ShoreProps from "../world/ShoreProps";
import Fireflies from "../world/Fireflies";

export default class Experience {
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: Camera;
  renderer: Renderer;
  debug: Debug;

  private terrain: Terrain;
  private lighting: Lighting;
  private sky: SkyEnvironment;
  private grass: Grass;
  private bushes: Bushes;
  private flowers: Flowers;
  private trees: Trees;
  private lake: Lake;
  private shoreProps: ShoreProps;
  private fireflies: Fireflies;
  private postProcessing: PostProcessing;

  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.debug = new Debug();
    this.camera = new Camera(this.canvas);
    this.renderer = new Renderer(this.canvas);

    this.lighting = new Lighting(this.scene);
    this.sky = new SkyEnvironment(this.scene, this.renderer.instance);
    this.terrain = new Terrain(this.scene);
    this.grass = new Grass(this.scene, this.terrain);
    this.bushes = new Bushes(this.scene, this.terrain);
    this.flowers = new Flowers(this.scene, this.terrain);
    this.trees = new Trees(
      this.scene,
      this.terrain.sampler,
      this.renderer.instance,
      this.camera.instance,
    );
    this.lake = new Lake(
      this.scene,
      this.renderer.instance,
      this.camera.instance,
    );
    this.shoreProps = new ShoreProps(
      this.scene,
      this.renderer.instance,
      this.camera.instance,
    );
    this.fireflies = new Fireflies(this.scene);

    this.postProcessing = new PostProcessing(
      this.renderer.instance,
      this.scene,
      this.camera.instance,
    );

    this.renderer.compile(this.scene, this.camera.instance);

    this.lighting.setupGui(this.debug.gui);
    this.grass.setupGui(this.debug.gui);
    this.bushes.setupGui(this.debug.gui);
    this.flowers.setupGui(this.debug.gui);
    this.trees.setupGui(this.debug.gui);
    this.shoreProps.setupGui(this.debug.gui);
    this.fireflies.setupGui(this.debug.gui);

    window.addEventListener("resize", () => this.onResize());
    this.tick();
  }

  private onResize() {
    this.camera.resize();
    this.renderer.resize();
    this.postProcessing.resize();
  }

  private tick() {
    this.debug.begin();
    const elapsed = this.clock.getElapsedTime();
    this.grass.update(elapsed);
    this.bushes.update(elapsed);
    this.flowers.update(elapsed);
    this.trees.update(this.camera.instance);
    this.fireflies.update(elapsed);
    this.lake.update(elapsed);
    this.camera.update();
    this.postProcessing.update();
    this.postProcessing.render();
    this.debug.end();
    requestAnimationFrame(() => this.tick());
  }

  destroy() {
    window.removeEventListener("resize", () => this.onResize());
    this.terrain.dispose();
    this.lighting.dispose();
    this.sky.dispose();
    this.grass.dispose();
    this.bushes.dispose();
    this.flowers.dispose();
    this.trees.dispose();
    this.lake.dispose();
    this.shoreProps.dispose();
    this.fireflies.dispose();
    this.postProcessing.dispose();
    this.debug.destroy();
    this.camera.destroy();
    this.renderer.destroy();
  }
}
