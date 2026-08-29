export function DemandDescriptionPreview({ description }: { description?: string | null }) {
  const text = description?.trim();
  if (!text) return null;

  return <p className="demand-description-preview">{text}</p>;
}
