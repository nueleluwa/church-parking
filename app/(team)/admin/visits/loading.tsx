import { SkeletonPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from "@/components/ds/Skeleton";

/** Shown while the visits list loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonHeader />
      <SkeletonMetrics />
      <SkeletonTable rows={8} filters />
    </SkeletonPage>
  );
}
