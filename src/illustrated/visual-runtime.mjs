export class VisualRuntime {
  #adapters;
  #prepared = new Map();

  constructor(adapters) {
    this.#adapters = new Map(Object.entries(adapters));
  }

  async prepare(bundle, assets = []) {
    const adapter = this.#adapters.get(bundle.renderer);
    if (!adapter) throw new Error(`No renderer adapter registered for ${bundle.renderer}`);
    await adapter.prepare(bundle, assets);
    this.#prepared.set(bundle.id, adapter);
  }

  async renderAt(bundle, target, absoluteSeconds) {
    const adapter = this.#prepared.get(bundle.id);
    if (!adapter) throw new Error(`Scene ${bundle.id} has not been prepared`);
    await adapter.seek(absoluteSeconds);
    await adapter.render(target);
  }

  async snapshotAt(bundle, absoluteSeconds) {
    const adapter = this.#prepared.get(bundle.id);
    if (!adapter) throw new Error(`Scene ${bundle.id} has not been prepared`);
    return adapter.snapshot(absoluteSeconds);
  }

  dispose() {
    for (const adapter of new Set(this.#prepared.values())) adapter.dispose();
    this.#prepared.clear();
  }
}

export function assertRendererAdapter(adapter) {
  for (const method of ["prepare", "seek", "render", "snapshot", "dispose"]) {
    if (typeof adapter?.[method] !== "function") {
      throw new TypeError(`Renderer adapter is missing ${method}()`);
    }
  }
  return adapter;
}
