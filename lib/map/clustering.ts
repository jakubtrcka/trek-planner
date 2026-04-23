import Supercluster from "supercluster";
import type { MapPoint } from "../types";
import type { CastlePoint } from "../castles/types";

export type PointKind = "peak" | "castle";

export type ClusterFeature = {
  type: "cluster";
  id: number;
  lat: number;
  lon: number;
  count: number;
  kinds: Set<PointKind>;
};

export type PointFeaturePeak = { type: "point"; kind: "peak"; point: MapPoint };
export type PointFeatureCastle = { type: "point"; kind: "castle"; point: CastlePoint };
export type PointFeature = PointFeaturePeak | PointFeatureCastle;
export type ClusterResult = ClusterFeature | PointFeature;

type TaggedInput =
  | { kind: "peak"; point: MapPoint }
  | { kind: "castle"; point: CastlePoint };

export function tagPeaks(points: MapPoint[]): TaggedInput[] {
  return points.map((point) => ({ kind: "peak" as const, point }));
}

export function tagCastles(points: CastlePoint[]): TaggedInput[] {
  return points.map((point) => ({ kind: "castle" as const, point }));
}

export function computeClusters(
  inputs: TaggedInput[],
  zoom: number,
  bounds: { west: number; south: number; east: number; north: number }
): ClusterResult[] {
  const sc = new Supercluster({ radius: 55, maxZoom: 10, minPoints: 4 });
  sc.load(
    inputs.map((tagged) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [tagged.point.lon, tagged.point.lat] },
      properties: { tagged },
    }))
  );

  const clusters = sc.getClusters(
    [bounds.west, bounds.south, bounds.east, bounds.north],
    Math.floor(zoom)
  );

  return clusters.map((f) => {
    if (f.properties.cluster) {
      const leaves = sc.getLeaves(f.properties.cluster_id as number, Infinity);
      const kinds = new Set<PointKind>(leaves.map((l) => (l.properties.tagged as TaggedInput).kind));
      return {
        type: "cluster",
        id: f.properties.cluster_id as number,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        count: f.properties.point_count as number,
        kinds,
      };
    }
    const tagged = f.properties.tagged as TaggedInput;
    if (tagged.kind === "peak") return { type: "point", kind: "peak", point: tagged.point };
    return { type: "point", kind: "castle", point: tagged.point };
  });
}
