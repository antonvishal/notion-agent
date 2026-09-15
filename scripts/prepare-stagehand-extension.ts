const source = Bun.file(
  new URL(
    "../node_modules/@browserbasehq/stagehand/dist/assets/stagehand-extension.zip",
    import.meta.url,
  ),
);
const destination = new URL(
  "../agent/assets/stagehand-extension.zip",
  import.meta.url,
);

if (!(await source.exists())) {
  throw new Error("The installed Stagehand package does not contain its extension archive.");
}

await Bun.write(destination, source);
