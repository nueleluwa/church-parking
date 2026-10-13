import { SkeletonPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while the reports loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader actions />
      <SkeletonMetrics />
      <SkeletonTable rows={7} filters />
    </SkeletonPage>
  );
}
