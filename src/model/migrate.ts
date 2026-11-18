import { repairInteriors } from './interiors';
import { SCHEMA_VERSION, type MapDocument } from './types';

/**
 * Wheel stops, columns, pillars and bollards sit in or between parking
 * stalls, so they belong above the spaces. Earlier versions put them on the
 * Structure layer, under the stalls' white paint, where they could not be seen.
 */
const FIXTURES = new Set(['column', 'pillar', 'bollard', 'parking-stop']);
function liftFixtures(doc: MapDocument) {
  for (const f of doc.floors) {
    const structure = f.layers?.find((l) => l.role === 'structure')?.id;
    const landmarks = f.layers?.find((l) => l.role === 'landmarks')?.id;
    if (!structure || !landmarks) continue;
    for (const o of f.objects) if (o.kind === 'asset' && o.layerId === structure && FIXTURES.has(o.assetKey)) o.layerId = landmarks;
  }
}

/**
 * Upgrades stored documents to the current schema so maps saved by older
 * versions keep opening. Add a step here whenever the schema changes.
 */
export function migrateDocument(raw: unknown): MapDocument {
  const doc = raw as MapDocument;
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.floors)) throw new Error('This file is not a valid map.');
  if ((doc.schemaVersion ?? 0) > SCHEMA_VERSION)
    throw new Error('This map was saved by a newer version of Bergeron Maps. Please refresh the page to update.');
  doc.settings ??= { gridSize: 10 };
  for (const f of doc.floors) {
    f.rows ??= {};
    f.objects ??= [];
  }
  liftFixtures(doc);
  repairInteriors(doc);
  doc.schemaVersion = SCHEMA_VERSION;
  return doc;
}
