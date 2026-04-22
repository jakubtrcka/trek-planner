export type MapPoint = {
  lat: number;
  lon: number;
  name?: string;
  peakName?: string;
  altitude?: number | string;
  mountainLink?: string;
  source?: string;
  locationId?: number;
  areaSlugs?: string[];
};
