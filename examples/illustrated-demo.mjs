import { writeFile, mkdir } from "node:fs/promises";
import { compileVisualStory } from "../src/illustrated/visual-compiler.mjs";

const project = compileVisualStory({
  beats: [
    {
      beatId: "demo-01",
      informationGoal: "Explain why prediction errors update a model",
      analogy: "A courier reroutes after finding a bridge closed",
      protagonist: "courier",
      action: "route collapses and rebuilds",
      setting: "fictional geometric city",
      visualHook: "the map argues with reality and loses",
      seriousness: "normal",
      claimIds: ["fictional-demo"],
      jokeId: "map-loses",
      tokenAnchors: ["token-001", "token-018"],
      kind: "analogy",
    },
    {
      beatId: "demo-02",
      informationGoal: "Show the update as a causal mechanism",
      protagonist: "courier",
      action: "error flows backward through the route graph",
      setting: "abstract mechanism stage",
      visualHook: "cause and correction remain visible together",
      seriousness: "protected",
      claimIds: ["fictional-demo"],
      tokenAnchors: ["token-019", "token-040"],
      kind: "mechanism",
    },
  ],
});

await mkdir("output", { recursive: true });
await writeFile("output/illustrated-demo.json", `${JSON.stringify(project, null, 2)}\n`);
console.log("Wrote output/illustrated-demo.json");
