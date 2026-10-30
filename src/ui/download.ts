export function download(
  filename: string,
  text: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(
    new Blob([...(type === "text/csv" ? ["\uFEFF"] : []), text], {
      type: `${type};charset=utf-8`,
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
