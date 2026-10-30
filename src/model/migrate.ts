import { SCHEMA_VERSION, type MapDocument } from './types';

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
  doc.schemaVersion = SCHEMA_VERSION;
  return doc;
}
