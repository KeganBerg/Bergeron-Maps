/** Small helpers for the viewer: link hints in the address, describing a picked object, search and screen reader text, sharing. */
import { useEffect, useState } from 'react';
import { ASSET_BY_KEY } from '../assets/library';
import type { Messages } from '../i18n/en';
import { MAX_HITS } from '../model/search';
import { symbolName } from '../model/words';
import type { Floor, MapDocument, MapObject } from '../model/types';
import { feet, minutes } from '../model/route';
import { floorTitle } from '../model/interiors';
import type { Directions } from './directionsTypes';
import type { Box } from '../model/types';

/** "#/view/abc?from=el_1": a sign's QR code can say where people are standing. */
export function fromHint(): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('from');
}

/** "#/view/abc?at=sp_1": a shared link to one space or place opens on it. */
export function atHint(): string | null {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('at');
}

/** A link to this map that opens on one space or place (the published map, never the draft). */
export function linkTo(objectId: string): string {
  const [route] = window.location.hash.split('?');
  return `${window.location.origin}${window.location.pathname}${route}?at=${encodeURIComponent(objectId)}`;
}

export const ago = (iso: string, locale?: string) => new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function describe(o: MapObject, doc: MapDocument, t: Messages): { title: string; detail?: string } {
  const d = describeObject(o, doc, t);
  // The place a sign's QR code says you're standing at.
  if (o.id === fromHint()) return { title: d.title, detail: t.words.parts([t.youAreHere, d.detail]) };
  return d;
}

function describeObject(o: MapObject, doc: MapDocument, t: Messages): { title: string; detail?: string } {
  const w = t.words;
  if (o.kind === 'space') return { title: w.space(o.label || w.noNumber), detail: o.accessible ? t.accessibleSpace : undefined };
  if (o.kind === 'text') return { title: o.text };
  const def = ASSET_BY_KEY[o.assetKey];
  const kind = symbolName(o.assetKey, w);
  const to = (o.connectsTo ?? []).map((id) => doc.floors.find((f) => f.id === id)?.name).filter(Boolean);
  return {
    title: o.name || o.label || kind || t.object,
    detail: w.parts([def && o.name !== kind && kind, to.length > 0 && w.goesTo(w.list(to))]) || undefined,
  };
}

export function boxOf(p: number[]): Box {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let i = 0; i < p.length; i += 2) {
    x1 = Math.min(x1, p[i]); x2 = Math.max(x2, p[i]);
    y1 = Math.min(y1, p[i + 1]); y2 = Math.max(y2, p[i + 1]);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** What a screen reader hears as the search results change. The list stops at MAX_HITS. */
export function searchSummary(count: number, t: Messages): string {
  if (!count) return t.noMatches;
  if (count >= MAX_HITS) return t.manyResults(MAX_HITS);
  return t.results(count);
}

/** `value`, once it has stayed the same for `ms`. An empty value comes through at once. */
export function useSettled(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (!value) { setSettled(''); return; }
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** Phones open their own share sheet (Messages, email…); computers copy the link and call `copied`. */
export async function shareLink(url: string, title: string, copied: () => void): Promise<void> {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title, url });
    else {
      await navigator.clipboard.writeText(url);
      copied();
    }
  } catch {
    /* closed the share sheet */
  }
}

/** What screen readers hear when it changes: the side view, directions, the list, what search found, or what's picked. */
export function viewerAnnouncement({ t, doc, floor, groupSize, sideOpen, dir, listOpen, searching, searchSaid, info, tappedFloor }: {
  t: Messages;
  doc: MapDocument;
  floor: Floor;
  groupSize: number;
  sideOpen: boolean;
  dir: Directions | null;
  listOpen: boolean;
  /** The search results are open with something typed. */
  searching: boolean;
  searchSaid: string;
  info: { title: string; detail?: string } | null;
  tappedFloor: Floor | null | undefined;
}): string {
  return sideOpen ? t.saySideView(groupSize)
    : dir
    ? dir.stage === 'pick' ? t.sayPick(dir.goal.name)
      : dir.stage === 'tap' ? t.sayTap
      : dir.stage === 'busy' ? t.finding
      : dir.stage === 'none' ? (dir.reason === 'same' ? t.alreadyThere : t.sayNoWay(dir.goal.name, dir.start.name))
      : t.sayRoute(dir.goal.name, feet(dir.route.length), minutes(dir.route), dir.route.steps.length)
    : listOpen ? t.sayList(floorTitle(doc, floor, t.words))
    // Typing in the search box while a card is open reads out what the search found, not the card again.
    : searching ? searchSaid
    : info ? t.words.parts([info.title, tappedFloor && floorTitle(doc, tappedFloor, t.words), info.detail])
    : '';
}
