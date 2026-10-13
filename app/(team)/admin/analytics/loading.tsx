import { SkeletonPage, SkeletonHeader, SkeletonMetrics, SkeletonTable, Block } from "@/components/ds/Skeleton";

/** Shown while analytics loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader actions />
      <SkeletonMetrics />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface space-y-3">
          <Block className="h-6 w-40" />
          <Block className="h-56 w-full" />
        </div>
        <div className="surface space-y-3">
          <Block className="h-6 w-40" />
          <Block className="h-56 w-full" />
        </div>
      </div>
      <SkeletonTable rows={5} />
    </SkeletonPage>
  );
}
