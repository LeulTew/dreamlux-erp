import { prepareWithSegments, measureLineStats } from "@chenglou/pretext";
import { EventType } from "@/lib/types";

interface LayoutParams {
  columnWidth: number;
  gap: number;
  columns: number;
}

/**
 * Calculates the exact height of an event card before rendering.
 * Updated for the metadata-only model with description support.
 */
export function calculateCardHeight(
  event: EventType, 
  columnWidth: number, 
  isEditing = false
): number {
  const padding = 32 * 2; // p-8
  const footerHeight = 84; 
  const gapBetweenSections = 16;
  const editBottomHeight = 100;

  // 1. Measure Title using Pretext
  const titleFontSize = 20;
  const titleLineHeight = 1.25;
  const titleFont = `900 ${titleFontSize}px var(--font-geist-sans), Inter, sans-serif`;
  
  const titlePrepared = prepareWithSegments(event.event_name.toUpperCase(), titleFont, {});
  const titleStats = measureLineStats(titlePrepared, columnWidth - padding);
  const titleHeight = (titleStats.lineCount || 1) * titleFontSize * titleLineHeight;

  if (isEditing) {
    // In edit mode, we have Name input (approx 60px) + Description Textarea (approx 120px) + Labels
    return padding + 60 + 120 + 40 + editBottomHeight;
  }

  // 2. Measure Description (if exists)
  let descriptionHeight = 0;
  if (event.description) {
    const descFontSize = 12;
    const descLineHeight = 1.625; // leading-relaxed
    const descFont = `500 ${descFontSize}px var(--font-geist-sans), Inter, sans-serif`;
    
    const descPrepared = prepareWithSegments(event.description, descFont, {});
    const descStats = measureLineStats(descPrepared, columnWidth - padding);
    descriptionHeight = (descStats.lineCount || 1) * descFontSize * descLineHeight;
  }

  return padding + titleHeight + (event.description ? gapBetweenSections + descriptionHeight : 0) + footerHeight + 20;
}

/**
 * Distributes cards into columns using the greedy masonry algorithm.
 */
export function packMasonry(
  events: EventType[], 
  params: LayoutParams,
  overrides: Record<string, { isEditing: boolean }> = {}
) {
  const { columns, columnWidth, gap } = params;
  const columnHeights = new Array(columns).fill(0);
  const packedItems = events.map((event) => {
    const shortestColIndex = columnHeights.indexOf(Math.min(...columnHeights));
    
    const ov = overrides[event.id] || { isEditing: false };
    const height = calculateCardHeight(event, columnWidth, ov.isEditing);
    const x = shortestColIndex * (columnWidth + gap);
    const y = columnHeights[shortestColIndex];

    columnHeights[shortestColIndex] += height + gap;

    return {
      id: event.id,
      x,
      y,
      height,
      event
    };
  });

  return {
    items: packedItems,
    containerHeight: Math.max(...columnHeights)
  };
}
