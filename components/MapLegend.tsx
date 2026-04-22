import { cn } from "../lib/utils";

type Props = {
  isLoading: boolean;
  climbedColor: string;
  unclimbedColor: string;
};

export function MapLegend({ isLoading, climbedColor, unclimbedColor }: Props) {
  if (isLoading) {
    return (
      <div className="absolute bottom-6 left-3 z-[1000] rounded-lg bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
        <span className="text-zinc-400">Načítám výstupy...</span>
      </div>
    );
  }

  return (
    <div className="absolute bottom-6 left-3 z-[1000] flex flex-col gap-1 rounded-lg bg-white/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className={cn("h-3 w-3 rounded-full")} style={{ backgroundColor: unclimbedColor }} />
        <span className="text-zinc-600">Nevylezený vrchol</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn("h-3 w-3 rounded-full")} style={{ backgroundColor: climbedColor }} />
        <span className="text-zinc-600">Vylezený vrchol</span>
      </div>
    </div>
  );
}
