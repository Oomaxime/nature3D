import GUI from "lil-gui";
import Stats from "stats.js";

export default class Debug {
  gui: GUI;
  stats: Stats;

  constructor() {
    this.gui = new GUI({ title: "Debug" });
    this.gui.close();

    this.stats = new Stats();
    this.stats.showPanel(0);
    document.body.appendChild(this.stats.dom);
  }

  begin() {
    this.stats.begin();
  }

  end() {
    this.stats.end();
  }

  destroy() {
    this.gui.destroy();
    document.body.removeChild(this.stats.dom);
  }
}
