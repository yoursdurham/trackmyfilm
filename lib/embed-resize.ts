export const EMBED_HEIGHT_MESSAGE_TYPE = "tmf-embed-height" as const;

export type EmbedHeightMessage = {
  type: typeof EMBED_HEIGHT_MESSAGE_TYPE;
  height: number;
};

type HeightDocument = {
  documentElement: { scrollHeight: number };
  body: { scrollHeight: number } | null;
};

type HeightParent = {
  postMessage: (message: EmbedHeightMessage, targetOrigin: "*") => void;
};

export function documentContentHeight(doc: HeightDocument): number {
  return Math.ceil(Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0));
}

export function postEmbedHeight(doc: HeightDocument, parent: HeightParent): number {
  const height = documentContentHeight(doc);
  parent.postMessage({ type: EMBED_HEIGHT_MESSAGE_TYPE, height }, "*");
  return height;
}

export function watchEmbedHeight(doc: HeightDocument, parent: HeightParent): () => void {
  const post = () => postEmbedHeight(doc, parent);
  post();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(() => post());
  observer.observe(doc.documentElement as unknown as Element);
  if (doc.body) observer.observe(doc.body as unknown as Element);
  return () => observer.disconnect();
}
