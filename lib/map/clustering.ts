import Supercluster from "supercluster";
import type { MapPoint } from "../types";

export type ClusterFeature = {
  type: "cluster";
  id: number;
  lat: number;
  lon: number;
  count: number;
};

export type PointFeature = {
  type: "point";
  point: MapPoint;
};

export type ClusterResult = ClusterFeature | PointFeature;

export function computeClusters(
  points: MapPoint[],
  zoom: number,
  bounds: { west: number; south: number; east: number; north: number }
): ClusterResult[] {
  const sc = new Supercluster({ radius: 60, maxZoom: 14 });
  sc.load(
    points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
      properties: { point: p },
    }))
  );

  const clusters = sc.getClusters(
    [bounds.west, bounds.south, bounds.east, bounds.north],
    Math.floor(zoom)
  );

  return clusters.map((f) => {
    if (f.properties.cluster) {
      return {
        type: "cluster",
        id: f.properties.cluster_id as number,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        count: f.properties.point_count as number,
      };
    }
    return { type: "point", point: f.properties.point as MapPoint };
  });
}
