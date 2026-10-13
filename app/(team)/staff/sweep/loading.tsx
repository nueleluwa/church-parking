import { SkeletonPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while Sweep loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader actions />
      <SkeletonMetrics />
      <SkeletonTable rows={8} filters />
    </SkeletonPage>
  );
}
