export interface ExampleImage {
  id: string;
  group: "bow" | "sword" | "unfiltered";
  label: string;
  url: string;
}

const bowImages = import.meta.glob("../set_example_bow/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const swordImages = import.meta.glob("../set_example_sword/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const unfilteredImages = import.meta.glob("../unfiltered/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export const examples: ExampleImage[] = [
  ...toExamples(bowImages, "bow", "弓套示例"),
  ...toExamples(swordImages, "sword", "剑套示例"),
  ...toExamples(unfilteredImages, "unfiltered", "候选样本"),
];

function toExamples(
  modules: Record<string, string>,
  group: ExampleImage["group"],
  labelPrefix: string,
): ExampleImage[] {
  return Object.entries(modules)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, url], index) => ({
      id: `${group}-${index}`,
      group,
      label: `${labelPrefix} ${index + 1}`,
      url,
      fileName: path.split(/[\\/]/).pop() ?? path,
    }));
}
